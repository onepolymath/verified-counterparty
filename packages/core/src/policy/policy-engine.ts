import { formatContract, NETWORKS, type NetworkName } from "../networks.js";
import type { CounterpartyEvidence } from "../verifier/evidence.js";
import type { Policy } from "./policy-schema.js";
import type { SpendLedger } from "./spend-ledger.js";

/** What the seller asked for (an x402 `PaymentRequirements`, reduced to what policy needs). */
export interface PaymentIntent {
  readonly network: string;
  readonly asset: string;
  /** Atomic units, decimal string. */
  readonly amount: string;
  readonly payTo: string;
}

export type RuleOutcome = "pass" | "fail" | "skip";

export interface RuleResult {
  readonly id: RuleId;
  readonly title: string;
  readonly outcome: RuleOutcome;
  readonly detail: string;
}

export type RuleId =
  | "network.allowed"
  | "registry.reachable"
  | "badge.resolves"
  | "badge.active"
  | "registry.trusted"
  | "card.integrity"
  | "card.self_reference"
  | "resolver.agrees"
  | "identity.credential"
  | "payee.bound"
  | "account.denylist"
  | "account.allowlist"
  | "registration.age"
  | "asset.allowed"
  | "amount.cap"
  | "budget.daily";

export interface Decision {
  readonly verdict: "ALLOW" | "DENY";
  readonly results: readonly RuleResult[];
  readonly failed: readonly RuleResult[];
  /** One-line human summary, suitable for logs and UIs. */
  readonly summary: string;
}

export interface EvaluateContext {
  readonly evidence: CounterpartyEvidence;
  readonly intent: PaymentIntent;
  readonly ledger: SpendLedger;
  readonly now: Date;
}

type Rule = (ctx: EvaluateContext, policy: Policy, network: NetworkName) => RuleResult;

const r = (id: RuleId, title: string, outcome: RuleOutcome, detail: string): RuleResult => ({
  id,
  title,
  outcome,
  detail,
});
const pass = (id: RuleId, title: string, detail: string) => r(id, title, "pass", detail);
const fail = (id: RuleId, title: string, detail: string) => r(id, title, "fail", detail);
const skip = (id: RuleId, title: string, detail: string) => r(id, title, "skip", detail);

const RULES: readonly Rule[] = [
  ({ intent }, _p, network) => {
    const t = "Payment is on the configured Concordium network";
    const expected = NETWORKS[network].caip2;
    return intent.network === expected
      ? pass("network.allowed", t, expected)
      : fail("network.allowed", t, `seller asked for ${intent.network}, expected ${expected}`);
  },
  ({ evidence }) => {
    const t = "Agent Registry reachable";
    return evidence.registryError
      ? fail("registry.reachable", t, `failing closed: ${evidence.registryError}`)
      : pass("registry.reachable", t, "on-chain lookup succeeded");
  },
  ({ evidence }, p) => {
    const t = "Badge resolves to an on-chain CIS-8004 agent";
    if (!p.requireBadge) return skip("badge.resolves", t, "policy does not require a badge");
    if (!evidence.tokenAddress)
      return fail("badge.resolves", t, `"${evidence.input}" is not a badge`);
    return evidence.record
      ? pass(
          "badge.resolves",
          t,
          `token #${evidence.record.token_id} owned by ${short(evidence.record.owner_account)}`,
        )
      : fail("badge.resolves", t, "no CIS-8004 record for this badge");
  },
  ({ evidence }, p) => {
    const t = "Agent is Active (not revoked)";
    if (!p.requireBadge) return skip("badge.active", t, "policy does not require a badge");
    if (!evidence.record) return fail("badge.active", t, "no on-chain record");
    return evidence.record.status === "Active"
      ? pass("badge.active", t, "status = Active")
      : fail("badge.active", t, `status = ${evidence.record.status}`);
  },
  ({ evidence }, p, network) => {
    const t = "Badge is issued by a trusted registry";
    if (!p.requireBadge) return skip("registry.trusted", t, "policy does not require a badge");
    const trusted = p.trustedRegistries.length
      ? p.trustedRegistries
      : [formatContract(NETWORKS[network].cis8004)];
    if (!evidence.decoded) return fail("registry.trusted", t, "badge could not be decoded");
    return trusted.includes(evidence.decoded.registry)
      ? pass("registry.trusted", t, `CIS-8004 <${evidence.decoded.registry}>`)
      : fail("registry.trusted", t, `registry <${evidence.decoded.registry}> is not trusted`);
  },
  ({ evidence }, p) => {
    const t = "Agent Card SHA-256 matches the on-chain anchor";
    if (!p.requireCardIntegrity) return skip("card.integrity", t, "not required by policy");
    const c = evidence.card;
    if (!c.url) return fail("card.integrity", t, "agent has no agent_uri");
    if (!c.fetched) return fail("card.integrity", t, c.error ?? "card could not be fetched");
    return c.hashMatches
      ? pass("card.integrity", t, `sha256 ${c.sha256?.slice(0, 12) ?? ""}… = on-chain`)
      : fail(
          "card.integrity",
          t,
          `served card ${c.sha256?.slice(0, 12) ?? "?"}… ≠ on-chain ${c.onChainHash?.slice(0, 12) ?? "none"}…`,
        );
  },
  ({ evidence }, p) => {
    const t = "Card's badge points back at this agent";
    if (!p.requireBadge) return skip("card.self_reference", t, "policy does not require a badge");
    if (!evidence.card.fetched) return fail("card.self_reference", t, "card not available");
    return evidence.card.selfReferenceMatches
      ? pass("card.self_reference", t, "badge block names this token and owner")
      : fail("card.self_reference", t, "card carries no matching Verified by Concordium badge");
  },
  ({ evidence }, p) => {
    const t = "Hosted badge resolver agrees";
    if (!p.requireBadge) return skip("resolver.agrees", t, "policy does not require a badge");
    const v = evidence.resolver;
    if (!v.reachable)
      return skip("resolver.agrees", t, `resolver unreachable; local checks stand (${v.error})`);
    return v.badgeValid
      ? pass("resolver.agrees", t, "badge_valid = true")
      : fail("resolver.agrees", t, v.issues[0] ?? "badge_valid = false");
  },
  ({ evidence }, p) => {
    const t = "Owner holds an Identity-Provider credential";
    if (p.requireIdentityCredential === "never")
      return skip("identity.credential", t, "not required by policy");
    const id = evidence.identity;
    if (!evidence.record) return fail("identity.credential", t, "no owner account to check");
    if (!id) {
      return p.requireIdentityCredential === "always"
        ? fail("identity.credential", t, "no identity checker configured")
        : skip("identity.credential", t, "no identity checker configured");
    }
    switch (id.status) {
      case "verified":
        return pass(
          "identity.credential",
          t,
          `credential from IdP #${id.identityProviders.join(", #")}`,
        );
      case "absent":
        return fail("identity.credential", t, "owner account has no IdP credential");
      case "unavailable":
        return p.requireIdentityCredential === "always"
          ? fail("identity.credential", t, `node unreachable: ${id.error}`)
          : skip("identity.credential", t, `node unreachable: ${id.error}`);
    }
  },
  ({ evidence, intent }, p) => {
    const t = "payTo is the agent's on-chain wallet";
    if (!p.requirePayeeBinding) return skip("payee.bound", t, "not required by policy");
    const pe = evidence.payee;
    if (!pe) return fail("payee.bound", t, "no payTo supplied");
    if (!pe.boundAccount) return fail("payee.bound", t, "agent has no on-chain payment account");
    return pe.matches
      ? pass("payee.bound", t, `${short(intent.payTo)} = ${pe.boundVia ?? "?"}`)
      : fail(
          "payee.bound",
          t,
          `payTo ${short(intent.payTo)} ≠ on-chain ${short(pe.boundAccount)} (possible impersonation)`,
        );
  },
  ({ evidence, intent }, p) => {
    const t = "Counterparty is not deny-listed";
    const hits = [intent.payTo, evidence.record?.owner_account].filter(
      (a): a is string => !!a && p.denyAccounts.includes(a),
    );
    return hits.length
      ? fail("account.denylist", t, `${short(hits[0] ?? "")} is deny-listed`)
      : pass("account.denylist", t, "no match");
  },
  ({ evidence, intent }, p) => {
    const t = "Counterparty is on the allow-list";
    if (!p.allowAccounts.length) return skip("account.allowlist", t, "no allow-list configured");
    const ok = [intent.payTo, evidence.record?.owner_account].some(
      (a) => !!a && p.allowAccounts.includes(a),
    );
    return ok
      ? pass("account.allowlist", t, "listed")
      : fail("account.allowlist", t, "not on allow-list");
  },
  ({ evidence, now }, p) => {
    const t = "Agent registration is old enough";
    if (p.minRegistrationAgeHours <= 0) return skip("registration.age", t, "no minimum age");
    const at = evidence.record?.registered_at;
    if (!at) return fail("registration.age", t, "registration time unknown");
    const hours = (now.getTime() - Date.parse(at)) / 3_600_000;
    return hours >= p.minRegistrationAgeHours
      ? pass("registration.age", t, `${Math.floor(hours)}h old`)
      : fail(
          "registration.age",
          t,
          `registered ${Math.floor(hours)}h ago (< ${p.minRegistrationAgeHours}h)`,
        );
  },
  ({ intent }, p) => {
    const t = "Asset is allowed";
    return p.allowedAssets.includes(intent.asset)
      ? pass("asset.allowed", t, intent.asset)
      : fail("asset.allowed", t, `${intent.asset} is not an allowed asset`);
  },
  ({ intent }, p) => {
    const t = "Amount is within the per-payment cap";
    const cap = p.maxAmountPerPayment[intent.asset];
    if (cap === undefined) return fail("amount.cap", t, `no cap configured for ${intent.asset}`);
    const amount = toAtomic(intent.amount);
    if (amount === null) return fail("amount.cap", t, `invalid amount "${intent.amount}"`);
    return amount <= BigInt(cap)
      ? pass("amount.cap", t, `${intent.amount} ≤ ${cap}`)
      : fail("amount.cap", t, `${intent.amount} > cap ${cap}`);
  },
  ({ intent, ledger, now }, p) => {
    const t = "Within the rolling 24h budget";
    const budget = p.dailyBudget[intent.asset];
    if (budget === undefined)
      return fail("budget.daily", t, `no budget configured for ${intent.asset}`);
    const amount = toAtomic(intent.amount);
    if (amount === null) return fail("budget.daily", t, "invalid amount");
    const spent = ledger.spentInWindow(intent.asset, now);
    return spent + amount <= BigInt(budget)
      ? pass("budget.daily", t, `${spent + amount} / ${budget}`)
      : fail("budget.daily", t, `would reach ${spent + amount} > budget ${budget}`);
  },
];

/** Pure, deterministic policy evaluation. Every rule runs, so the audit log shows the full picture. */
export class PolicyEngine {
  constructor(
    private readonly policy: Policy,
    private readonly network: NetworkName,
  ) {}

  evaluate(ctx: EvaluateContext): Decision {
    const results = RULES.map((rule) => rule(ctx, this.policy, this.network));
    const failed = results.filter((x) => x.outcome === "fail");
    const verdict = failed.length === 0 ? "ALLOW" : "DENY";
    const summary =
      verdict === "ALLOW"
        ? `ALLOW: ${results.filter((x) => x.outcome === "pass").length} checks passed`
        : `DENY: ${failed.map((f) => f.id).join(", ")}`;
    return { verdict, results, failed, summary };
  }
}

function toAtomic(amount: string): bigint | null {
  return /^\d+$/.test(amount) ? BigInt(amount) : null;
}

function short(account: string): string {
  return account.length > 14 ? `${account.slice(0, 6)}…${account.slice(-4)}` : account;
}
