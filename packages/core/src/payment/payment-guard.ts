import type { AuditLog } from "../audit/audit-log.js";
import type { NetworkName } from "../networks.js";
import { NETWORKS } from "../networks.js";
import type { Decision, PaymentIntent, PolicyEngine } from "../policy/policy-engine.js";
import type { SpendLedger } from "../policy/spend-ledger.js";
import type { CounterpartyVerifier } from "../verifier/counterparty-verifier.js";
import type { CounterpartyEvidence } from "../verifier/evidence.js";
import { VerifiedCounterpartyError } from "../util/errors.js";
import type { FetchLike } from "../util/http.js";
import { extractCardBadge } from "../registry/badge.js";
import type { Payer } from "./payer.js";
import {
  advertisedBadge,
  readPaymentRequired,
  readSettleResponse,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
} from "./x402-types.js";

export interface GuardDeps {
  readonly network: NetworkName;
  readonly verifier: CounterpartyVerifier;
  readonly engine: PolicyEngine;
  readonly ledger: SpendLedger;
  readonly audit: AuditLog;
  readonly payer: Payer;
  readonly fetch?: FetchLike;
  readonly clock?: () => Date;
}

export interface AuthorizeOptions {
  /** Resource being bought; used to discover the seller's Agent Card and for the audit trail. */
  readonly resourceUrl: string;
  /** Badge learnt out-of-band (e.g. from registry discovery). Takes precedence over claims. */
  readonly expectedBadge?: string;
  /** Why the agent is buying; recorded for accountability. */
  readonly purpose?: string;
}

export interface Authorization {
  readonly decision: Decision;
  readonly evidence: CounterpartyEvidence | null;
  readonly requirement: PaymentRequirements | null;
  readonly badgeSource: BadgeSource;
  readonly auditSeq: number;
}

export type BadgeSource = "expected" | "x402-extension" | "agent-card" | "none";

export class PaymentRefusedError extends VerifiedCounterpartyError {
  constructor(readonly authorization: Authorization) {
    super(`payment refused: ${authorization.decision.summary}`, "PAYMENT_REFUSED");
    this.name = "PaymentRefusedError";
  }
}

export interface PaidResponse {
  readonly response: Response;
  readonly authorization: Authorization | null;
  readonly settlement: SettleResponse | null;
}

/**
 * The payment guard sits between an agent and its x402 wallet. For every 402 it:
 *   1. works out which badge the seller claims,
 *   2. has the verifier collect chain-anchored evidence about that badge,
 *   3. asks the policy engine for a verdict,
 *   4. writes the full decision to the hash-chained audit log,
 *   5. only then lets the payer sign a payment for the approved requirement.
 */
export class PaymentGuard {
  private readonly fetchImpl: FetchLike;
  private readonly clock: () => Date;

  constructor(private readonly deps: GuardDeps) {
    this.fetchImpl = deps.fetch ?? fetch;
    this.clock = deps.clock ?? (() => new Date());
  }

  async authorize(pr: PaymentRequired, opts: AuthorizeOptions): Promise<Authorization> {
    const caip2 = NETWORKS[this.deps.network].caip2;
    const candidates = pr.accepts.filter((a) => a.network === caip2 && a.scheme === "exact");
    const ordered = candidates.length ? candidates : pr.accepts.slice(0, 1);

    let best: Omit<Authorization, "auditSeq"> | null = null;
    for (const requirement of ordered) {
      const { badge, source } = await this.discoverBadge(pr, requirement, opts);
      const intent: PaymentIntent = {
        network: requirement.network,
        asset: requirement.asset,
        amount: requirement.amount,
        payTo: requirement.payTo,
      };
      const evidence = await this.deps.verifier.collect({
        badge: badge ?? "",
        payTo: requirement.payTo,
      });
      const decision = this.deps.engine.evaluate({
        evidence,
        intent,
        ledger: this.deps.ledger,
        now: this.clock(),
      });
      best = { decision, evidence, requirement, badgeSource: source };
      if (decision.verdict === "ALLOW") break;
    }

    if (!best) {
      throw new VerifiedCounterpartyError(
        "402 response offered no payment options",
        "BAD_PAYMENT_REQUIRED",
      );
    }

    const entry = await this.deps.audit.append("payment.decision", {
      verdict: best.decision.verdict,
      summary: best.decision.summary,
      resource: opts.resourceUrl,
      purpose: opts.purpose ?? null,
      badge: best.evidence?.tokenAddress ?? null,
      badgeSource: best.badgeSource,
      counterparty: best.evidence?.record
        ? {
            tokenId: best.evidence.record.token_id,
            owner: best.evidence.record.owner_account,
            agentUri: best.evidence.record.agent_uri,
            cardSha256: best.evidence.card.sha256 ?? null,
          }
        : null,
      intent: best.requirement
        ? {
            network: best.requirement.network,
            asset: best.requirement.asset,
            amount: best.requirement.amount,
            payTo: best.requirement.payTo,
          }
        : null,
      rules: best.decision.results.map((x) => ({ id: x.id, outcome: x.outcome, detail: x.detail })),
    });
    return { ...best, auditSeq: entry.seq };
  }

  /**
   * Drop-in replacement for `fetch` that transparently pays x402 resources,
   * but only after the counterparty passes policy. Throws `PaymentRefusedError` otherwise.
   */
  async fetch(
    url: string,
    init: RequestInit = {},
    opts: Omit<AuthorizeOptions, "resourceUrl"> = {},
  ): Promise<PaidResponse> {
    const first = await this.fetchImpl(url, init);
    if (first.status !== 402) return { response: first, authorization: null, settlement: null };

    const pr = await readPaymentRequired(first);
    if (!pr)
      throw new VerifiedCounterpartyError(
        "402 without a valid x402 PaymentRequired",
        "BAD_PAYMENT_REQUIRED",
      );

    const authorization = await this.authorize(pr, { ...opts, resourceUrl: url });
    if (authorization.decision.verdict !== "ALLOW" || !authorization.requirement) {
      throw new PaymentRefusedError(authorization);
    }
    const req = authorization.requirement;

    // Reserve budget before signing, so concurrent calls cannot overspend.
    this.deps.ledger.record(req.asset, BigInt(req.amount), this.clock());

    const headers = await this.deps.payer.createPaymentHeaders({ ...pr, accepts: [req] }, req);
    const paid = await this.fetchImpl(url, {
      ...init,
      headers: { ...headersToRecord(init.headers), ...headers },
    });
    const settlement = readSettleResponse(paid);

    if (paid.ok) {
      await this.deps.audit.append("payment.settled", {
        decisionSeq: authorization.auditSeq,
        resource: url,
        payer: this.deps.payer.kind,
        simulated: this.deps.payer.kind === "simulated",
        transaction: settlement?.transaction ?? null,
        network: settlement?.network ?? req.network,
        amount: req.amount,
        asset: req.asset,
        payTo: req.payTo,
      });
    } else {
      await this.deps.audit.append("payment.failed", {
        decisionSeq: authorization.auditSeq,
        resource: url,
        status: paid.status,
        reason: settlement?.errorReason ?? null,
      });
    }
    return { response: paid, authorization, settlement };
  }

  private async discoverBadge(
    pr: PaymentRequired,
    req: PaymentRequirements,
    opts: AuthorizeOptions,
  ): Promise<{ badge: string | null; source: BadgeSource }> {
    if (opts.expectedBadge) return { badge: opts.expectedBadge, source: "expected" };
    const advertised = advertisedBadge(pr, req);
    if (advertised) return { badge: advertised, source: "x402-extension" };
    try {
      const origin = new URL(opts.resourceUrl).origin;
      const res = await this.fetchImpl(`${origin}/.well-known/agent-card.json`);
      if (res.ok) {
        const claim = extractCardBadge(await res.json());
        if (claim?.badge) return { badge: claim.badge.tokenAddress, source: "agent-card" };
      }
    } catch {
      /* no card: fall through */
    }
    return { badge: null, source: "none" };
  }
}

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  return Object.fromEntries(new Headers(h).entries());
}
