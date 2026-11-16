import { z } from "zod";

/** Non-negative integer amount in the asset's smallest unit (e.g. microCCD), as a decimal string. */
export const AtomicAmount = z
  .string()
  .regex(/^\d+$/, "amount must be a non-negative integer in atomic units");

/**
 * The declarative payment policy. Defaults are deliberately strict ("fail closed"):
 * a counterparty must prove every property unless an operator relaxes it explicitly.
 */
export const PolicySchema = z.object({
  /** The counterparty must present a Verified by Concordium badge that resolves on chain. */
  requireBadge: z.boolean().default(true),
  /** The Agent Card we fetch ourselves must hash to the on-chain `metadata_hash`. */
  requireCardIntegrity: z.boolean().default(true),
  /** x402 `payTo` must be the agent's on-chain payment wallet (or its owner when unset). */
  requirePayeeBinding: z.boolean().default(true),
  /**
   * The owning account must hold an on-chain credential issued by a Concordium
   * Identity Provider (read over gRPC). `"if-available"` passes when the node is unreachable.
   */
  requireIdentityCredential: z.enum(["always", "if-available", "never"]).default("if-available"),
  /** CIS-8004 registries we trust, as `index,subindex`. Empty = the network's official registry. */
  trustedRegistries: z.array(z.string().regex(/^\d+,\d+$/)).default([]),
  /** x402 assets we will pay in (CCD or a protocol-level token id). */
  allowedAssets: z.array(z.string().min(1)).default(["CCD", "USDR", "EURR"]),
  /** Hard cap per single payment, keyed by asset. Assets without a cap are refused. */
  maxAmountPerPayment: z.record(z.string(), AtomicAmount).default({
    CCD: "1000000",
    USDR: "1000000",
    EURR: "1000000",
  }),
  /** Rolling 24h spend budget, keyed by asset. */
  dailyBudget: z.record(z.string(), AtomicAmount).default({
    CCD: "5000000",
    USDR: "5000000",
    EURR: "5000000",
  }),
  /** Refuse agents registered more recently than this (fresh-sybil defence). 0 disables. */
  minRegistrationAgeHours: z.number().nonnegative().default(0),
  /** Accounts we never pay, regardless of badge. */
  denyAccounts: z.array(z.string()).default([]),
  /** If non-empty, only these owner/wallet accounts may be paid. */
  allowAccounts: z.array(z.string()).default([]),
});

export type Policy = z.infer<typeof PolicySchema>;
export type PolicyInput = z.input<typeof PolicySchema>;

export function definePolicy(input: PolicyInput = {}): Policy {
  return PolicySchema.parse(input);
}
