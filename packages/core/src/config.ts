import { z } from "zod";
import { NETWORKS, type NetworkInfo } from "./networks.js";
import { PolicySchema } from "./policy/policy-schema.js";

/**
 * Typed runtime configuration. Every value has a safe default so the guard can be
 * constructed with `loadConfig({})`; environment variables override defaults.
 */
export const ConfigSchema = z.object({
  network: z.enum(["testnet", "mainnet"]).default("testnet"),
  registry: z
    .object({
      /** Hosted Concordium Agent Registry MCP endpoint (JSON-RPC 2.0). */
      mcpUrl: z.url().default("https://agent-registry-mcp.concordium.com/mcp"),
      /** Agent Registry indexer (enumeration, registration history). */
      indexerUrl: z.url().default("https://agent-registry-indexer.concordium.com"),
      timeoutMs: z.number().int().positive().default(10_000),
    })
    .prefault({}),
  x402: z
    .object({
      facilitatorUrl: z.url().default("https://concordium-facilitator.onrender.com"),
    })
    .prefault({}),
  policy: PolicySchema.prefault({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;

export function loadConfig(input: ConfigInput = {}, env: NodeJS.ProcessEnv = {}): Config {
  const fromEnv: Record<string, unknown> = {};
  if (env["VC_NETWORK"]) fromEnv["network"] = env["VC_NETWORK"];
  const registry: Record<string, unknown> = {};
  if (env["VC_REGISTRY_MCP_URL"]) registry["mcpUrl"] = env["VC_REGISTRY_MCP_URL"];
  if (env["VC_REGISTRY_INDEXER_URL"]) registry["indexerUrl"] = env["VC_REGISTRY_INDEXER_URL"];
  const x402: Record<string, unknown> = {};
  if (env["VC_FACILITATOR_URL"]) x402["facilitatorUrl"] = env["VC_FACILITATOR_URL"];

  return ConfigSchema.parse({
    ...fromEnv,
    ...input,
    registry: { ...registry, ...input.registry },
    x402: { ...x402, ...input.x402 },
  });
}

export function networkOf(config: Config): NetworkInfo {
  return NETWORKS[config.network];
}
