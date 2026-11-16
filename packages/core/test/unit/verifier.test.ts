import { describe, expect, it } from "vitest";
import { CounterpartyVerifier } from "../../src/verifier/counterparty-verifier.js";
import { StaticIdentityChecker } from "../../src/verifier/identity-checker.js";
import {
  FakeRegistry,
  honestAgent,
  NOW,
  OWNER,
  routedFetch,
  SCAMMER,
  TESTNET,
  agentCard,
  badgeFor,
} from "../helpers.js";

async function setup(opts: { withIdentity?: boolean } = {}) {
  const agent = await honestAgent();
  const registry = new FakeRegistry().add(agent.record);
  const fetch = routedFetch({ [agent.cardUrl]: agent.cardBody });
  const verifier = new CounterpartyVerifier({
    network: "testnet",
    registry,
    fetch,
    clock: () => NOW,
    ...(opts.withIdentity
      ? {
          identity: new StaticIdentityChecker({
            [OWNER]: { status: "verified", identityProviders: [0] },
          }),
        }
      : {}),
  });
  return { agent, registry, fetch, verifier };
}

describe("CounterpartyVerifier", () => {
  it("collects consistent evidence for an honest agent", async () => {
    const { agent, verifier } = await setup({ withIdentity: true });
    const ev = await verifier.collect({ badge: agent.badge, payTo: OWNER });
    expect(ev).toMatchObject({
      tokenAddress: agent.badge,
      decoded: { registry: "12802,0", tokenId: "1190" },
      record: { status: "Active" },
      card: {
        fetched: true,
        hashMatches: true,
        selfReferenceMatches: true,
        name: "Honest Data Agent",
      },
      resolver: { reachable: true, badgeValid: true },
      payee: { matches: true, boundVia: "agent_wallet" },
      identity: { status: "verified" },
      collectedAt: NOW.toISOString(),
    });
  });

  it("accepts the CAIP-19 badge form", async () => {
    const { agent, verifier } = await setup();
    const ev = await verifier.collect({ badge: `${TESTNET.caip2}/cis-2:${agent.badge}` });
    expect(ev.record).not.toBeNull();
  });

  it("refuses a badge for another network without touching the registry", async () => {
    const { agent, verifier, registry } = await setup();
    const ev = await verifier.collect({
      badge: `ccd:9dd9ca4d19e9393877d2c44b70f89acb/cis-2:${agent.badge}`,
      payTo: OWNER,
    });
    expect(ev.record).toBeNull();
    expect(ev.resolver).toEqual({ reachable: false, error: "badge is for another network" });
    expect(ev.payee?.matches).toBe(false);
    expect(registry.calls).toBe(0);
  });

  it("flags a payTo that is not the agent's on-chain wallet (impersonation)", async () => {
    const { agent, verifier } = await setup();
    const ev = await verifier.collect({ badge: agent.badge, payTo: SCAMMER });
    expect(ev.payee).toEqual({
      payTo: SCAMMER,
      boundAccount: OWNER,
      boundVia: "agent_wallet",
      matches: false,
    });
  });

  it("falls back to the owner account when no agent wallet is set", async () => {
    const agent = await honestAgent(5, { agent_wallet: null });
    const verifier = new CounterpartyVerifier({
      network: "testnet",
      registry: new FakeRegistry().add(agent.record),
      fetch: routedFetch({ [agent.cardUrl]: agent.cardBody }),
    });
    expect((await verifier.collect({ badge: agent.badge, payTo: OWNER })).payee).toMatchObject({
      matches: true,
      boundVia: "owner_account",
    });
  });

  it("detects a card swapped after anchoring (hash mismatch)", async () => {
    const { agent, registry } = await setup();
    const swapped = agentCard(agent.badge, OWNER, "Totally Legit Agent");
    const verifier = new CounterpartyVerifier({
      network: "testnet",
      registry,
      fetch: routedFetch({ [agent.cardUrl]: swapped }),
    });
    const ev = await verifier.collect({ badge: agent.badge });
    expect(ev.card).toMatchObject({
      fetched: true,
      hashMatches: false,
      selfReferenceMatches: true,
    });
  });

  it("detects a card that borrows another agent's badge", async () => {
    const agent = await honestAgent(9);
    const body = agentCard(badgeFor(1190));
    const { sha256Hex } = await import("../../src/util/crypto.js");
    const record = { ...agent.record, metadata_hash_hex: await sha256Hex(body) };
    const verifier = new CounterpartyVerifier({
      network: "testnet",
      registry: new FakeRegistry().add(record),
      fetch: routedFetch({ [agent.cardUrl]: body }),
    });
    const ev = await verifier.collect({ badge: agent.badge });
    expect(ev.card).toMatchObject({ hashMatches: true, selfReferenceMatches: false });
  });

  it("reports an unreachable card", async () => {
    const { agent, registry } = await setup();
    const verifier = new CounterpartyVerifier({
      network: "testnet",
      registry,
      fetch: routedFetch({}),
    });
    expect((await verifier.collect({ badge: agent.badge })).card).toMatchObject({
      fetched: false,
      error: "card URL returned HTTP 404",
    });
  });

  it("handles agents with no agent_uri", async () => {
    const agent = await honestAgent(3, { agent_uri: null });
    const verifier = new CounterpartyVerifier({
      network: "testnet",
      registry: new FakeRegistry().add(agent.record),
      fetch: routedFetch({}),
    });
    expect((await verifier.collect({ badge: agent.badge })).card).toMatchObject({
      url: null,
      fetched: false,
      onChainHash: agent.record.metadata_hash_hex,
    });
  });

  it("records registry failures instead of throwing (so policy can fail closed)", async () => {
    const { agent, registry, verifier } = await setup();
    registry.failWith = new Error("registry down");
    registry.resolverFailWith = new Error("resolver down");
    const ev = await verifier.collect({ badge: agent.badge, payTo: OWNER });
    expect(ev).toMatchObject({
      record: null,
      registryError: "registry down",
      resolver: { reachable: false, error: "resolver down" },
    });
  });

  it("stringifies non-Error failures", async () => {
    const { agent, registry, verifier } = await setup();
    registry.failWith = "plain" as unknown as Error;
    registry.resolverFailWith = "plain" as unknown as Error;
    const ev = await verifier.collect({ badge: agent.badge });
    expect(ev.registryError).toBe("plain");
  });

  it("returns empty evidence for a non-badge", async () => {
    const { verifier } = await setup();
    const ev = await verifier.collect({ badge: "", payTo: OWNER });
    expect(ev).toMatchObject({
      tokenAddress: null,
      record: null,
      resolver: { reachable: false, error: "not a badge" },
      payee: { matches: false },
    });
  });

  it("returns no payee evidence for an unregistered badge", async () => {
    const { verifier } = await setup();
    const ev = await verifier.collect({ badge: badgeFor(999_999), payTo: OWNER });
    expect(ev.payee).toEqual({ payTo: OWNER, boundAccount: null, boundVia: null, matches: false });
  });
});
