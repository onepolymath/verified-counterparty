import type { NetworkName } from "../networks.js";
import type { AgentRecord } from "../registry/registry-client.js";
import type { IdentityEvidence } from "./identity-checker.js";

/**
 * Facts gathered about a counterparty. The verifier only *collects* evidence;
 * the policy engine alone decides whether it is good enough to pay.
 */
export interface CounterpartyEvidence {
  readonly input: string;
  readonly network: NetworkName;
  readonly tokenAddress: string | null;
  /** Registry contract + token id decoded locally from the badge string. */
  readonly decoded: { readonly registry: string; readonly tokenId: string } | null;
  /** On-chain CIS-8004 record, or null when the badge does not resolve. */
  readonly record: AgentRecord | null;
  /** Set when the registry could not be queried (we then fail closed). */
  readonly registryError?: string;
  readonly card: CardEvidence;
  /** Second opinion from the hosted badge resolver. */
  readonly resolver: ResolverEvidence;
  readonly payee: PayeeEvidence | null;
  readonly identity: IdentityEvidence | null;
  readonly collectedAt: string;
}

export interface CardEvidence {
  readonly url: string | null;
  readonly fetched: boolean;
  readonly error?: string;
  /** SHA-256 we computed ourselves over the served bytes. */
  readonly sha256?: string;
  readonly onChainHash: string | null;
  readonly hashMatches: boolean;
  /** The card's own badge claim points back at the same token. */
  readonly selfReferenceMatches: boolean;
  readonly name?: string;
}

export type ResolverEvidence =
  | { readonly reachable: true; readonly badgeValid: boolean; readonly issues: readonly string[] }
  | { readonly reachable: false; readonly error: string };

export interface PayeeEvidence {
  /** The account the seller asked us to pay (x402 `payTo`). */
  readonly payTo: string;
  /** The account the chain says this agent is paid at. */
  readonly boundAccount: string | null;
  readonly boundVia: "agent_wallet" | "owner_account" | null;
  readonly matches: boolean;
}
