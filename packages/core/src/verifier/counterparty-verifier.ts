import { formatContract, NETWORKS, type NetworkName } from "../networks.js";
import { extractCardBadge, parseBadge } from "../registry/badge.js";
import type { AgentRecord, RegistryClient } from "../registry/registry-client.js";
import { decodeTokenAddress } from "../registry/token-address.js";
import type { FetchLike } from "../util/http.js";
import { fetchCard } from "./card-fetcher.js";
import type {
  CardEvidence,
  CounterpartyEvidence,
  PayeeEvidence,
  ResolverEvidence,
} from "./evidence.js";
import type { IdentityChecker, IdentityEvidence } from "./identity-checker.js";

export interface VerifyRequest {
  /** Badge string presented by the counterparty (short or CAIP-19 form). */
  readonly badge: string;
  /** x402 `payTo` the counterparty wants paid; enables the payee-binding check. */
  readonly payTo?: string;
}

export interface VerifierDeps {
  readonly network: NetworkName;
  readonly registry: RegistryClient;
  readonly identity?: IdentityChecker;
  readonly fetch?: FetchLike;
  readonly clock?: () => Date;
}

/**
 * Collects independent, chain-anchored evidence about a counterparty agent.
 *
 * Trust model: the badge and the Agent Card are *claims* made by the counterparty.
 * We decode the badge locally, resolve it on chain through the registry, fetch the
 * card ourselves and recompute its SHA-256, and cross-check the hosted resolver.
 * No single service, and nothing the counterparty says, is trusted on its own.
 */
export class CounterpartyVerifier {
  constructor(private readonly deps: VerifierDeps) {}

  async collect(req: VerifyRequest): Promise<CounterpartyEvidence> {
    const { network } = this.deps;
    const collectedAt = (this.deps.clock?.() ?? new Date()).toISOString();
    const parsed = parseBadge(req.badge);

    if (!parsed || (parsed.chain && parsed.chain !== NETWORKS[network].caip2)) {
      return {
        input: req.badge,
        network,
        tokenAddress: parsed?.tokenAddress ?? null,
        decoded: null,
        record: null,
        card: emptyCard(),
        resolver: {
          reachable: false,
          error: parsed ? "badge is for another network" : "not a badge",
        },
        payee: req.payTo ? payeeEvidence(req.payTo, null) : null,
        identity: null,
        collectedAt,
      };
    }

    const decodedRaw = decodeTokenAddress(parsed.tokenAddress);
    const decoded = decodedRaw
      ? { registry: formatContract(decodedRaw.contract), tokenId: decodedRaw.tokenId }
      : null;

    const [{ record, error: registryError }, resolver] = await Promise.all([
      this.resolveRecord(parsed.tokenAddress),
      this.resolverVerdict(parsed.tokenAddress),
    ]);

    const [card, identity] = await Promise.all([
      this.cardEvidence(record, parsed.tokenAddress),
      record ? this.identityEvidence(record.owner_account) : Promise.resolve(null),
    ]);

    return {
      input: req.badge,
      network,
      tokenAddress: parsed.tokenAddress,
      decoded,
      record,
      ...(registryError ? { registryError } : {}),
      card,
      resolver,
      payee: req.payTo ? payeeEvidence(req.payTo, record) : null,
      identity,
      collectedAt,
    };
  }

  private async resolveRecord(
    tokenAddress: string,
  ): Promise<{ record: AgentRecord | null; error?: string }> {
    try {
      return {
        record: await this.deps.registry.agentByTokenAddress(tokenAddress, this.deps.network),
      };
    } catch (e) {
      return { record: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async resolverVerdict(tokenAddress: string): Promise<ResolverEvidence> {
    try {
      const v = await this.deps.registry.checkBadge(tokenAddress, this.deps.network);
      return { reachable: true, badgeValid: v.badge_valid, issues: v.issues.map((i) => i.message) };
    } catch (e) {
      return { reachable: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async cardEvidence(
    record: AgentRecord | null,
    tokenAddress: string,
  ): Promise<CardEvidence> {
    if (!record?.agent_uri)
      return { ...emptyCard(), onChainHash: record?.metadata_hash_hex ?? null };
    const onChainHash = record.metadata_hash_hex?.toLowerCase() ?? null;
    const fetched = await fetchCard(record.agent_uri, this.deps.fetch);
    if (!fetched.ok) {
      return {
        url: record.agent_uri,
        fetched: false,
        error: fetched.error,
        onChainHash,
        hashMatches: false,
        selfReferenceMatches: false,
      };
    }
    const claim = extractCardBadge(fetched.json);
    const name =
      fetched.json && typeof fetched.json === "object"
        ? (fetched.json as { name?: unknown }).name
        : undefined;
    return {
      url: record.agent_uri,
      fetched: true,
      sha256: fetched.sha256,
      onChainHash,
      hashMatches: onChainHash !== null && fetched.sha256 === onChainHash,
      selfReferenceMatches:
        claim?.badge?.tokenAddress === tokenAddress &&
        (claim.ownerAccount === null || claim.ownerAccount === record.owner_account),
      ...(typeof name === "string" ? { name: name.slice(0, 120) } : {}),
    };
  }

  private async identityEvidence(account: string): Promise<IdentityEvidence | null> {
    return this.deps.identity ? this.deps.identity.check(account) : null;
  }
}

function emptyCard(): CardEvidence {
  return {
    url: null,
    fetched: false,
    onChainHash: null,
    hashMatches: false,
    selfReferenceMatches: false,
  };
}

function payeeEvidence(payTo: string, record: AgentRecord | null): PayeeEvidence {
  if (!record) return { payTo, boundAccount: null, boundVia: null, matches: false };
  const viaWallet = record.agent_wallet ?? null;
  const boundAccount = viaWallet ?? record.owner_account;
  return {
    payTo,
    boundAccount,
    boundVia: viaWallet ? "agent_wallet" : "owner_account",
    matches: payTo === boundAccount,
  };
}
