import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { BADGE_EXTENSION_URI } from "../registry/badge.js";

export type { PaymentRequired, PaymentRequirements, SettleResponse };

export const HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED";
export const HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE";
export const HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE";

/** Extension key sellers use to advertise their badge inside an x402 402 response. */
export const X402_BADGE_EXTENSION = BADGE_EXTENSION_URI;

/** Reads an x402 v2 PaymentRequired from a 402 response (header first, then JSON body). */
export async function readPaymentRequired(res: Response): Promise<PaymentRequired | null> {
  const header = res.headers.get(HEADER_PAYMENT_REQUIRED);
  if (header) {
    try {
      return decodePaymentRequiredHeader(header);
    } catch {
      return null;
    }
  }
  try {
    const body = (await res.clone().json()) as Partial<PaymentRequired>;
    return Array.isArray(body.accepts) ? (body as PaymentRequired) : null;
  } catch {
    return null;
  }
}

export function readSettleResponse(res: Response): SettleResponse | null {
  const header = res.headers.get(HEADER_PAYMENT_RESPONSE);
  if (!header) return null;
  try {
    return decodePaymentResponseHeader(header);
  } catch {
    return null;
  }
}

/** The badge a seller advertises: `extensions[<badge-uri>].tokenAddress` or `extra.badge`. */
export function advertisedBadge(pr: PaymentRequired, req?: PaymentRequirements): string | null {
  const ext = pr.extensions?.[X402_BADGE_EXTENSION] as { tokenAddress?: unknown } | undefined;
  if (typeof ext?.tokenAddress === "string") return ext.tokenAddress;
  const extra = req?.extra["badge"];
  return typeof extra === "string" ? extra : null;
}
