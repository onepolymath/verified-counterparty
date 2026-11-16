import { describe, expect, it } from "vitest";
import { explorerLinks, formatContract, NETWORKS, networkByCaip2 } from "../../src/networks.js";

describe("networks", () => {
  it("resolves networks by CAIP-2 id", () => {
    expect(networkByCaip2("ccd:4221332d34e1694168c2a0c0b3fd0f27")?.name).toBe("testnet");
    expect(networkByCaip2("eip155:1")).toBeUndefined();
  });
  it("builds CCDExplorer links", () => {
    const t = NETWORKS.testnet;
    expect(explorerLinks.contract(t, t.cis8004)).toBe(
      "https://ccdexplorer.io/testnet/instance/12802/0",
    );
    expect(explorerLinks.account(t, "abc")).toBe("https://ccdexplorer.io/testnet/account/abc");
    expect(explorerLinks.transaction(t, "ff")).toBe(
      "https://ccdexplorer.io/testnet/transaction/ff",
    );
    expect(formatContract(t.cis8)).toBe("12801,0");
  });
});
