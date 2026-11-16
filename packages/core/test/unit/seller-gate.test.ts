import { describe, expect, it } from "vitest";
import { AuditLog, MemoryAuditSink } from "../../src/audit/audit-log.js";
import { PolicyEngine } from "../../src/policy/policy-engine.js";
import { definePolicy } from "../../src/policy/policy-schema.js";
import { SellerGate } from "../../src/seller/seller-gate.js";
import { CounterpartyVerifier } from "../../src/verifier/counterparty-verifier.js";
import { StaticIdentityChecker } from "../../src/verifier/identity-checker.js";
import { FakeRegistry, honestAgent, OWNER, routedFetch } from "../helpers.js";

describe("SellerGate", () => {
  async function gate(identity: "verified" | "absent") {
    const agent = await honestAgent();
    const verifier = new CounterpartyVerifier({
      network: "testnet",
      registry: new FakeRegistry().add(agent.record),
      fetch: routedFetch({ [agent.cardUrl]: agent.cardBody }),
      identity: new StaticIdentityChecker(
        identity === "verified" ? { [OWNER]: { status: "verified", identityProviders: [0] } } : {},
      ),
    });
    const engine = new PolicyEngine(
      definePolicy({ requirePayeeBinding: false, requireIdentityCredential: "always" }),
      "testnet",
    );
    const audit = new AuditLog(new MemoryAuditSink(), "seller");
    return { agent, audit, gate: new SellerGate({ network: "testnet", verifier, engine, audit }) };
  }

  it("serves buyer agents backed by an ID-verified owner", async () => {
    const { gate: g, agent, audit } = await gate("verified");
    expect((await g.check(agent.badge, "/api/data")).allowed).toBe(true);
    expect((await audit.entries())[0]).toMatchObject({
      type: "seller.gate",
      data: { verdict: "ALLOW", resource: "/api/data" },
    });
  });

  it("turns away anonymous agents and agents without an IdP credential", async () => {
    const { gate: g } = await gate("verified");
    expect((await g.check(null, "/api/data")).allowed).toBe(false);
    const { gate: g2, agent } = await gate("absent");
    const res = await g2.check(agent.badge, "/api/data");
    expect(res.allowed).toBe(false);
    expect(res.decision.failed.map((f) => f.id)).toEqual(["identity.credential"]);
  });
});
