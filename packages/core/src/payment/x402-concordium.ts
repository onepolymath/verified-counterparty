/**
 * REAL x402 payer for Concordium (testnet by default), built on the official
 * `@x402/concordium` exact scheme: the buyer signs a V1 *sponsored* transfer and the
 * facilitator named in `extra.feePayer` co-signs and pays the fee, so the buyer agent
 * never needs CCD for gas.
 *
 * Keys are read from the environment by the caller and never logged or persisted.
 */
import { AccountAddress, buildBasicAccountSigner } from "@concordium/web-sdk";
import { ExactConcordiumScheme } from "@x402/concordium/exact/client";
import { x402Client } from "@x402/core/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { Payer } from "./payer.js";

type BeforePaymentCreationHook = Parameters<x402Client["onBeforePaymentCreation"]>[0];
import type { PaymentGuard } from "./payment-guard.js";
import type { PaymentRequired, PaymentRequirements } from "./x402-types.js";
import { NETWORKS, type NetworkName } from "../networks.js";

export interface ConcordiumPayerOptions {
  readonly network: NetworkName;
  /** Base58 address of the buyer agent's Concordium account. */
  readonly account: string;
  /** Hex ed25519 signing key of that account (export from Concordium Wallet). */
  readonly privateKeyHex: string;
}

export class ConcordiumX402Payer implements Payer {
  readonly kind = "x402-concordium" as const;
  private readonly client: x402Client;

  constructor(opts: ConcordiumPayerOptions) {
    const scheme = new ExactConcordiumScheme({
      accountAddress: AccountAddress.fromBase58(opts.account),
      signer: buildBasicAccountSigner(opts.privateKeyHex),
    });
    this.client = new x402Client().register(NETWORKS[opts.network].caip2, scheme);
  }

  async createPaymentHeaders(
    paymentRequired: PaymentRequired,
    approved: PaymentRequirements,
  ): Promise<Record<string, string>> {
    const payload = await this.client.createPaymentPayload({
      ...paymentRequired,
      accepts: [approved],
    });
    return { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) };
  }
}

/**
 * For agents that already use `x402Client` directly: plug the guard in as an
 * `onBeforePaymentCreation` hook and every payment is policy-checked first.
 *
 *   client.onBeforePaymentCreation(guardHook(guard))
 */
export function guardHook(
  guard: PaymentGuard,
  resourceUrlOf: (pr: PaymentRequired) => string = (pr) => pr.resource.url,
): BeforePaymentCreationHook {
  return async ({ paymentRequired, selectedRequirements }) => {
    const auth = await guard.authorize(
      { ...paymentRequired, accepts: [selectedRequirements] },
      { resourceUrl: resourceUrlOf(paymentRequired) },
    );
    if (auth.decision.verdict !== "ALLOW") return { abort: true, reason: auth.decision.summary };
    return undefined;
  };
}
