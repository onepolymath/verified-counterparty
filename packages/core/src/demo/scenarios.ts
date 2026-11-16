import { NETWORKS } from "../networks.js";
import type { PaymentRequired } from "../payment/x402-types.js";
import { X402_BADGE_EXTENSION } from "../payment/x402-types.js";

/**
 * Demo counterparties. Every badge below is a REAL token in Concordium's testnet
 * Agent Registry (CIS-8004 <12802,0>), resolved live at run time. They are public
 * agents registered by other builders; labels describe the state of their badge,
 * not their operators. The impersonator's payout address is derived from a hash
 * and has no known key.
 */
export interface DemoAgent {
  readonly id: ScenarioId;
  readonly title: string;
  readonly story: string;
  readonly badge: string;
  readonly payTo: string;
  /** microCCD */
  readonly amount: string;
  readonly expected: "ALLOW" | "DENY";
}

export type ScenarioId =
  "verified" | "impersonator" | "noBadge" | "brokenCard" | "unregistered" | "overBudget";

const VERIFIED_BADGE = "JyP9X278CKWoNLAFg5kVr";
const VERIFIED_WALLET = "2yR1ck8SshaDaK1QbjkRbafjoRtzSVJ1LSSyn23AdkWazZ4Rqh";
export const IMPERSONATOR_ACCOUNT = "3x7cPbKo4A7vbTpsdh2QQpzWwZmodeYP6ZEgaUQWG23BEAfGF6";

export const DEMO_AGENTS: Readonly<Record<ScenarioId, DemoAgent>> = {
  verified: {
    id: "verified",
    title: "Verified seller",
    story:
      "A data API whose agent holds a valid Verified by Concordium badge and asks to be paid at its on-chain wallet.",
    badge: VERIFIED_BADGE,
    payTo: VERIFIED_WALLET,
    amount: "10000",
    expected: "ALLOW",
  },
  impersonator: {
    id: "impersonator",
    title: "Impersonator",
    story:
      "A scam endpoint copies the verified agent's badge into its 402 response, but asks to be paid at its own address.",
    badge: VERIFIED_BADGE,
    payTo: IMPERSONATOR_ACCOUNT,
    amount: "10000",
    expected: "DENY",
  },
  noBadge: {
    id: "noBadge",
    title: "Registered, no badge",
    story:
      "An agent that exists in the registry, but whose Agent Card carries no Verified by Concordium badge.",
    badge: "JyP9XD3wWaW5faY4pnwuS",
    payTo: "3mC9tNFNDhTLJNjHHEdrjkqvcCDLDbff1ceA1b9xah9cfxeCKA",
    amount: "10000",
    expected: "DENY",
  },
  brokenCard: {
    id: "brokenCard",
    title: "Card doesn't match chain",
    story:
      "An agent whose published Agent Card is gone or swapped, so its SHA-256 no longer matches the on-chain anchor.",
    badge: "JyP9TtQC3HCNrTYR3sc2T",
    payTo: "3dt3UMPzRASZndjmKpSWgCP2HhmoxZrgs8FDPtZjNHZzj13hhB",
    amount: "10000",
    expected: "DENY",
  },
  unregistered: {
    id: "unregistered",
    title: "Fake badge",
    story: "A well-formed badge string for a token that was never minted in the Agent Registry.",
    badge: "JyP9U13ZMgykjxpzjZGTb",
    payTo: IMPERSONATOR_ACCOUNT,
    amount: "10000",
    expected: "DENY",
  },
  overBudget: {
    id: "overBudget",
    title: "Verified, but over budget",
    story:
      "The verified seller asks for 2 CCD, above the buyer's 1 CCD per-payment cap. Identity isn't everything.",
    badge: VERIFIED_BADGE,
    payTo: VERIFIED_WALLET,
    amount: "2000000",
    expected: "DENY",
  },
};

/** Builds the x402 v2 `PaymentRequired` a seller in this scenario would send. */
export function paymentRequiredFor(agent: DemoAgent, resourceUrl: string): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: "Premium market data (1 call)",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: NETWORKS.testnet.caip2,
        asset: "CCD",
        amount: agent.amount,
        payTo: agent.payTo,
        maxTimeoutSeconds: 120,
        extra: { feePayer: "4nkWEqH5534jL4LkSQAuL6zZdZugaU171DXqVvWB7uHbecuYS6" },
      },
    ],
    extensions: { [X402_BADGE_EXTENSION]: { tokenAddress: agent.badge } },
  };
}
