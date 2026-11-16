/**
 * LIVE tests against Concordium testnet via the hosted Agent Registry MCP server.
 * Run with `pnpm test:live`. Not part of CI: they depend on third-party agents.
 */
import { describe, expect, it } from "vitest";
import { createGuard } from "../../src/factory.js";
import { DEMO_AGENTS } from "../../src/demo/scenarios.js";
import { TESTNET } from "../helpers.js";

const { verifier, engine, ledger } = createGuard({ identity: null });

async function decide(badge: string, payTo: string) {
  const evidence = await verifier.collect({ badge, payTo });
  return engine.evaluate({
    evidence,
    intent: { network: TESTNET.caip2, asset: "CCD", amount: "10000", payTo },
    ledger,
    now: new Date(),
  });
}

describe("live Concordium testnet", () => {
  it("allows a real agent with a valid Verified by Concordium badge", async () => {
    const a = DEMO_AGENTS.verified;
    expect((await decide(a.badge, a.payTo)).verdict).toBe("ALLOW");
  });

  it("refuses a registered agent whose card carries no badge", async () => {
    const a = DEMO_AGENTS.noBadge;
    expect((await decide(a.badge, a.payTo)).failed.map((f) => f.id)).toContain(
      "card.self_reference",
    );
  });

  it("refuses an agent whose card no longer matches its on-chain hash", async () => {
    const a = DEMO_AGENTS.brokenCard;
    expect((await decide(a.badge, a.payTo)).failed.map((f) => f.id)).toContain("card.integrity");
  });

  it("refuses a badge with no on-chain record", async () => {
    const a = DEMO_AGENTS.unregistered;
    expect((await decide(a.badge, a.payTo)).failed.map((f) => f.id)).toContain("badge.resolves");
  });
});
