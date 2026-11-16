import { describe, expect, it } from "vitest";
import { McpRegistryClient } from "../../src/registry/registry-client.js";
import type { FetchLike } from "../../src/util/http.js";

function mcpReturning(payload: unknown): FetchLike {
  return () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
}

const RECORD = {
  network: "testnet",
  token_address: "JyP9X278CKWoNLAFg5kVr",
  token_id: "1190",
  token_id_u64: 1190,
  owner_account: "2yR1ck8SshaDaK1QbjkRbafjoRtzSVJ1LSSyn23AdkWazZ4Rqh",
  agent_uri: "https://botin-7ud.pages.dev/.well-known/agent-card.json",
  metadata_hash_hex: "49a19c07a9c6716dc3898d7d60b4303a4445aea9e66ff7b3180f5bf4b23c2402",
  agent_wallet: "2yR1ck8SshaDaK1QbjkRbafjoRtzSVJ1LSSyn23AdkWazZ4Rqh",
  status: "Active",
  registered_at: "2026-11-15T14:28:22.914+00:00",
};

describe("McpRegistryClient", () => {
  it("parses an on-chain agent record (shape captured from the hosted testnet MCP)", async () => {
    const rec = await new McpRegistryClient("u", mcpReturning(RECORD)).agentByTokenAddress(
      "x",
      "testnet",
    );
    expect(rec).toMatchObject({ token_id: "1190", status: "Active" });
  });

  it("normalises numeric token ids to strings", async () => {
    const rec = await new McpRegistryClient(
      "u",
      mcpReturning({ ...RECORD, token_id: 5 }),
    ).agentByTokenAddress("x", "testnet");
    expect(rec?.token_id).toBe("5");
  });

  it.each([null, {}, { nope: 1 }])(
    "returns null when the registry has no record (%j)",
    async (payload) => {
      expect(
        await new McpRegistryClient("u", mcpReturning(payload)).agentByTokenAddress("x", "testnet"),
      ).toBeNull();
    },
  );

  it("parses a badge verdict", async () => {
    const v = await new McpRegistryClient(
      "u",
      mcpReturning({ badge_valid: false, issues: [{ severity: "error", message: "no badge" }] }),
    ).checkBadge("x", "testnet");
    expect(v).toMatchObject({ badge_valid: false, issues: [{ message: "no badge" }], checks: {} });
  });
});
