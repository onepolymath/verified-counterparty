import { z } from "zod";
import type { NetworkName } from "../networks.js";
import { McpClient } from "./mcp-client.js";
import type { FetchLike } from "../util/http.js";

/** On-chain CIS-8004 record, as returned by `agent_by_token_address`. */
export const AgentRecordSchema = z.object({
  network: z.string(),
  token_address: z.string(),
  token_id: z.union([z.string(), z.number()]).transform(String),
  owner_account: z.string(),
  agent_uri: z.string().nullable(),
  metadata_hash_hex: z.string().nullable(),
  agent_wallet: z.string().nullable().optional(),
  status: z.enum(["Active", "Revoked"]),
  registered_at: z.string().nullable().optional(),
});
export type AgentRecord = z.infer<typeof AgentRecordSchema>;

/** The hosted resolver's verdict (`check_badge`). Kept loose: we only rely on a few fields. */
export const BadgeVerdictSchema = z.looseObject({
  token_address: z.string().optional(),
  badge_valid: z.boolean(),
  checks: z.record(z.string(), z.unknown()).default({}),
  issues: z
    .array(z.looseObject({ severity: z.string().optional(), message: z.string() }))
    .default([]),
  expected: z
    .looseObject({ contracts: z.looseObject({ cis8004: z.string().optional() }).optional() })
    .optional(),
});
export type BadgeVerdict = z.infer<typeof BadgeVerdictSchema>;

export interface RegistryClient {
  /** Resolves a badge on chain. Returns null when no CIS-8004 record exists. */
  agentByTokenAddress(tokenAddress: string, network: NetworkName): Promise<AgentRecord | null>;
  /** Asks the hosted resolver for its badge verdict (a second, independent opinion). */
  checkBadge(tokenAddress: string, network: NetworkName): Promise<BadgeVerdict>;
}

/** RegistryClient backed by Concordium's hosted Agent Registry MCP server. */
export class McpRegistryClient implements RegistryClient {
  private readonly mcp: McpClient;

  constructor(mcpUrl: string, fetchImpl: FetchLike = fetch, timeoutMs = 10_000) {
    this.mcp = new McpClient(mcpUrl, fetchImpl, timeoutMs);
  }

  async agentByTokenAddress(
    tokenAddress: string,
    network: NetworkName,
  ): Promise<AgentRecord | null> {
    const out = await this.mcp.callTool("agent_by_token_address", {
      token_address: tokenAddress,
      network,
    });
    if (out === null || (typeof out === "object" && Object.keys(out).length === 0)) return null;
    const parsed = AgentRecordSchema.safeParse(out);
    return parsed.success ? parsed.data : null;
  }

  async checkBadge(tokenAddress: string, network: NetworkName): Promise<BadgeVerdict> {
    const out = await this.mcp.callTool("check_badge", { id: tokenAddress, network });
    return BadgeVerdictSchema.parse(out);
  }
}
