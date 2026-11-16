import { AuditLog, MemoryAuditSink, type AuditSink } from "./audit/audit-log.js";
import { loadConfig, type Config, type ConfigInput } from "./config.js";
import { PaymentGuard } from "./payment/payment-guard.js";
import { SimulatedPayer, type Payer } from "./payment/payer.js";
import { PolicyEngine } from "./policy/policy-engine.js";
import { SpendLedger } from "./policy/spend-ledger.js";
import { McpRegistryClient, type RegistryClient } from "./registry/registry-client.js";
import { CounterpartyVerifier } from "./verifier/counterparty-verifier.js";
import { GrpcIdentityChecker, type IdentityChecker } from "./verifier/identity-checker.js";
import { NETWORKS } from "./networks.js";
import type { FetchLike } from "./util/http.js";

export interface CreateGuardOptions {
  readonly config?: ConfigInput | Config;
  readonly actor?: string;
  readonly payer?: Payer;
  readonly auditSink?: AuditSink;
  readonly registry?: RegistryClient;
  /** Pass `null` to disable the on-chain identity-credential lookup. */
  readonly identity?: IdentityChecker | null;
  readonly fetch?: FetchLike;
  readonly clock?: () => Date;
}

/** Wires the four modules together with production defaults (Concordium testnet). */
export function createGuard(opts: CreateGuardOptions = {}) {
  const config = loadConfig(opts.config);
  const network = NETWORKS[config.network];
  const fetchImpl = opts.fetch ?? fetch;
  const registry =
    opts.registry ??
    new McpRegistryClient(config.registry.mcpUrl, fetchImpl, config.registry.timeoutMs);
  const identity =
    opts.identity === null ? undefined : (opts.identity ?? new GrpcIdentityChecker(network));
  const verifier = new CounterpartyVerifier({
    network: config.network,
    registry,
    fetch: fetchImpl,
    ...(identity ? { identity } : {}),
    ...(opts.clock ? { clock: opts.clock } : {}),
  });
  const engine = new PolicyEngine(config.policy, config.network);
  const ledger = new SpendLedger();
  const audit = new AuditLog(
    opts.auditSink ?? new MemoryAuditSink(),
    opts.actor ?? "buyer-agent",
    opts.clock,
  );
  const guard = new PaymentGuard({
    network: config.network,
    verifier,
    engine,
    ledger,
    audit,
    payer: opts.payer ?? new SimulatedPayer(),
    fetch: fetchImpl,
    ...(opts.clock ? { clock: opts.clock } : {}),
  });
  return { config, guard, verifier, engine, ledger, audit };
}
