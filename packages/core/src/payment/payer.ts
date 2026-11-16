import type { PaymentRequired, PaymentRequirements } from "./x402-types.js";
import { sha256Hex } from "../util/crypto.js";

/**
 * Produces the x402 payment header for exactly one, already-authorised requirement.
 * The guard never hands a payer anything it has not approved.
 */
export interface Payer {
  readonly kind: "x402-concordium" | "simulated";
  createPaymentHeaders(
    paymentRequired: PaymentRequired,
    approved: PaymentRequirements,
  ): Promise<Record<string, string>>;
}

export const SIMULATED_SCHEME_MARKER = "vc-simulated";

/**
 * MOCK payer. Emits a clearly-marked simulated payload and moves no funds.
 * Used by tests and by the hosted demo when no funded testnet account is configured.
 */
export class SimulatedPayer implements Payer {
  readonly kind = "simulated" as const;

  constructor(private readonly payer = "SIMULATED-BUYER") {}

  async createPaymentHeaders(
    paymentRequired: PaymentRequired,
    approved: PaymentRequirements,
  ): Promise<Record<string, string>> {
    const nonce = await sha256Hex(
      `${approved.payTo}:${approved.amount}:${Date.now()}:${Math.random()}`,
    );
    const payload = {
      x402Version: paymentRequired.x402Version,
      accepted: approved,
      payload: { [SIMULATED_SCHEME_MARKER]: true, payer: this.payer, nonce },
    };
    return { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payload)) };
  }
}
