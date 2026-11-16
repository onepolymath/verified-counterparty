import { z } from "zod";

/** Versioned A2A extension URI of the Verified by Concordium badge. */
export const BADGE_EXTENSION_URI = "https://docs.concordium.com/a2a-extensions/concordium-badge/v1";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const CAIP19 = /^(ccd:[0-9a-f]{32})\/cis-2:([1-9A-HJ-NP-Za-km-z]+)$/;
const CAIP10 = /^(ccd:[0-9a-f]{32}):(.+)$/;

export interface ParsedBadge {
  /** Short form: Base58Check CIS-2 token address of the agent NFT. */
  readonly tokenAddress: string;
  /** CAIP-2 chain id when the canonical form was given. */
  readonly chain?: string;
}

/** Accepts either the short Base58Check form or the canonical CAIP-19 form. */
export function parseBadge(input: string): ParsedBadge | null {
  const s = input.trim();
  const caip = CAIP19.exec(s);
  if (caip?.[1] && caip[2]) return { tokenAddress: caip[2], chain: caip[1] };
  if (s.length >= 12 && s.length <= 40 && BASE58.test(s)) return { tokenAddress: s };
  return null;
}

/** Strips a CAIP-10 prefix (`ccd:<chain>:<account>`) and returns `{chain, id}`. */
export function parseCaip10(input: string): { chain: string | null; id: string } {
  const m = CAIP10.exec(input);
  return m?.[1] && m[2] ? { chain: m[1], id: m[2] } : { chain: null, id: input };
}

const BadgeParams = z.looseObject({
  tokenAddress: z.string().nullable().optional(),
  owner: z.looseObject({ account: z.string() }).optional(),
  agentWallet: z.string().optional(),
  contracts: z.looseObject({ cis8004: z.string().optional() }).optional(),
});

export interface CardBadge {
  readonly badge: ParsedBadge | null;
  readonly ownerAccount: string | null;
  readonly registry: string | null;
  readonly embedding: "extension" | "legacy";
}

/**
 * Finds the badge an Agent Card claims. This is a *claim*, never proof: the verifier
 * always resolves it against the chain before trusting anything in it.
 */
export function extractCardBadge(card: unknown): CardBadge | null {
  if (card === null || typeof card !== "object") return null;
  const c = card as Record<string, unknown>;
  const caps = c["capabilities"] as { extensions?: unknown } | undefined;
  const exts = Array.isArray(caps?.extensions) ? (caps.extensions as unknown[]) : [];
  const ext = exts.find(
    (e): e is { params: unknown } =>
      typeof e === "object" && e !== null && (e as { uri?: unknown }).uri === BADGE_EXTENSION_URI,
  );
  const legacy = c["concordium"];
  const raw = ext ? ext.params : legacy;
  if (raw === undefined) return null;
  const parsed = BadgeParams.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const registry = p.contracts?.cis8004 ? parseCaip10(p.contracts.cis8004).id : null;
  return {
    badge: p.tokenAddress ? parseBadge(p.tokenAddress) : null,
    ownerAccount: p.owner ? parseCaip10(p.owner.account).id : null,
    registry: registry ? registry.replace(".", ",") : null,
    embedding: ext ? "extension" : "legacy",
  };
}
