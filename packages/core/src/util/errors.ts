export class VerifiedCounterpartyError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VerifiedCounterpartyError";
  }
}

export type ErrorCode =
  | "REGISTRY_UNAVAILABLE"
  | "REGISTRY_PROTOCOL"
  | "INVALID_BADGE"
  | "PAYMENT_REFUSED"
  | "PAYMENT_FAILED"
  | "BAD_PAYMENT_REQUIRED";
