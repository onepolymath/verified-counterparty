import { describe, expect, it } from "vitest";
import { loadConfig, networkOf } from "../../src/config.js";
import { definePolicy } from "../../src/policy/policy-schema.js";

describe("config", () => {
  it("defaults to Concordium testnet and the hosted registry, strict policy", () => {
    const c = loadConfig();
    expect(c.network).toBe("testnet");
    expect(c.registry.mcpUrl).toBe("https://agent-registry-mcp.concordium.com/mcp");
    expect(c.policy).toMatchObject({
      requireBadge: true,
      requireCardIntegrity: true,
      requirePayeeBinding: true,
    });
    expect(networkOf(c).cis8004).toEqual({ index: 12802, subindex: 0 });
  });

  it("reads overrides from the environment, explicit input wins", () => {
    const c = loadConfig(
      { registry: { timeoutMs: 1234 } },
      {
        VC_NETWORK: "mainnet",
        VC_REGISTRY_MCP_URL: "https://m.example/mcp",
        VC_REGISTRY_INDEXER_URL: "https://i.example",
        VC_FACILITATOR_URL: "https://f.example",
      },
    );
    expect(c).toMatchObject({
      network: "mainnet",
      registry: {
        mcpUrl: "https://m.example/mcp",
        indexerUrl: "https://i.example",
        timeoutMs: 1234,
      },
      x402: { facilitatorUrl: "https://f.example" },
    });
    expect(loadConfig({ network: "testnet" }, { VC_NETWORK: "mainnet" }).network).toBe("testnet");
  });

  it("rejects invalid values", () => {
    expect(() => loadConfig({ registry: { mcpUrl: "nope" } })).toThrow();
    expect(() => definePolicy({ maxAmountPerPayment: { CCD: "-1" } })).toThrow(/atomic units/);
  });
});
