import type { Decision, PolicyEngine } from "../policy/policy-engine.js";
import { SpendLedger } from "../policy/spend-ledger.js";
import type { AuditLog } from "../audit/audit-log.js";
import type { CounterpartyVerifier } from "../verifier/counterparty-verifier.js";
import { NETWORKS, type NetworkName } from "../networks.js";

/** Header a buyer agent uses to present its Verified by Concordium badge to a seller. */
export const HEADER_AGENT_BADGE = "X-Agent-Badge";

export interface SellerGateDeps {
  readonly network: NetworkName;
  readonly verifier: CounterpartyVerifier;
  /** A policy tuned for *buyers*: payee binding off, identity credential on. */
  readonly engine: PolicyEngine;
  readonly audit: AuditLog;
}

export interface GateResult {
  readonly allowed: boolean;
  readonly decision: Decision;
}

/**
 * Seller side: before answering with a 402 (or serving the resource), require the
 * calling agent to present a badge that passes policy, i.e. only serve agents that a
 * verified, accountable human stands behind.
 */
export class SellerGate {
  constructor(private readonly deps: SellerGateDeps) {}

  async check(badgeHeader: string | null, resource: string): Promise<GateResult> {
    const evidence = await this.deps.verifier.collect({ badge: badgeHeader ?? "" });
    const decision = this.deps.engine.evaluate({
      evidence,
      // The gate is not a payment; a zero-value intent keeps the amount/budget rules neutral.
      intent: { network: NETWORKS[this.deps.network].caip2, asset: "CCD", amount: "0", payTo: "" },
      ledger: new SpendLedger(),
      now: new Date(),
    });
    await this.deps.audit.append("seller.gate", {
      resource,
      badge: evidence.tokenAddress,
      verdict: decision.verdict,
      summary: decision.summary,
    });
    return { allowed: decision.verdict === "ALLOW", decision };
  }
}
