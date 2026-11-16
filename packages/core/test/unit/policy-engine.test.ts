import { describe, expect, it } from "vitest";
import { PolicyEngine, type PaymentIntent, type RuleId } from "../../src/policy/policy-engine.js";
import { definePolicy, type PolicyInput } from "../../src/policy/policy-schema.js";
import { SpendLedger } from "../../src/policy/spend-ledger.js";
import type { CounterpartyEvidence } from "../../src/verifier/evidence.js";
import { NOW, OWNER, SCAMMER, TESTNET } from "../helpers.js";

const goodEvidence: CounterpartyEvidence = {
  input: "JyP9X278CKWoNLAFg5kVr",
  network: "testnet",
  tokenAddress: "JyP9X278CKWoNLAFg5kVr",
  decoded: { registry: "12802,0", tokenId: "1190" },
  record: {
    network: "testnet",
    token_address: "JyP9X278CKWoNLAFg5kVr",
    token_id: "1190",
    owner_account: OWNER,
    agent_uri: "https://a.example/card.json",
    metadata_hash_hex: "ab".repeat(32),
    agent_wallet: OWNER,
    status: "Active",
    registered_at: "2026-11-01T00:00:00.000Z",
  },
  card: {
    url: "https://a.example/card.json",
    fetched: true,
    sha256: "ab".repeat(32),
    onChainHash: "ab".repeat(32),
    hashMatches: true,
    selfReferenceMatches: true,
  },
  resolver: { reachable: true, badgeValid: true, issues: [] },
  payee: { payTo: OWNER, boundAccount: OWNER, boundVia: "agent_wallet", matches: true },
  identity: { status: "verified", identityProviders: [0] },
  collectedAt: NOW.toISOString(),
};

const intent: PaymentIntent = {
  network: TESTNET.caip2,
  asset: "CCD",
  amount: "10000",
  payTo: OWNER,
};

function run(
  evidence: Partial<CounterpartyEvidence> = {},
  policy: PolicyInput = {},
  i: Partial<PaymentIntent> = {},
  ledger = new SpendLedger(),
) {
  return new PolicyEngine(definePolicy(policy), "testnet").evaluate({
    evidence: { ...goodEvidence, ...evidence },
    intent: { ...intent, ...i },
    ledger,
    now: NOW,
  });
}

const outcome = (d: ReturnType<typeof run>, id: RuleId) =>
  d.results.find((x) => x.id === id)?.outcome;

describe("PolicyEngine", () => {
  it("allows a fully verified counterparty", () => {
    const d = run();
    expect(d.verdict).toBe("ALLOW");
    expect(d.failed).toEqual([]);
    expect(d.summary).toMatch(/^ALLOW: \d+ checks passed$/);
  });

  it("evaluates every rule even after a failure (complete audit picture)", () => {
    const d = run({
      record: null,
      payee: { payTo: OWNER, boundAccount: null, boundVia: null, matches: false },
    });
    expect(d.results).toHaveLength(16);
    expect(d.verdict).toBe("DENY");
    expect(d.summary).toContain("badge.resolves");
  });

  it.each<[string, Partial<CounterpartyEvidence>, RuleId]>([
    ["registry error", { registryError: "down" }, "registry.reachable"],
    ["non-badge", { tokenAddress: null }, "badge.resolves"],
    ["unregistered", { record: null }, "badge.resolves"],
    ["revoked", { record: { ...goodEvidence.record!, status: "Revoked" } }, "badge.active"],
    ["undecodable", { decoded: null }, "registry.trusted"],
    ["rogue registry", { decoded: { registry: "999,0", tokenId: "1" } }, "registry.trusted"],
    ["no agent_uri", { card: { ...goodEvidence.card, url: null } }, "card.integrity"],
    [
      "card fetch failed",
      { card: { ...goodEvidence.card, fetched: false, error: "HTTP 404" } },
      "card.integrity",
    ],
    [
      "card fetch failed w/o reason",
      {
        card: {
          url: "u",
          fetched: false,
          onChainHash: null,
          hashMatches: false,
          selfReferenceMatches: false,
        },
      },
      "card.integrity",
    ],
    ["hash mismatch", { card: { ...goodEvidence.card, hashMatches: false } }, "card.integrity"],
    [
      "hash mismatch w/o hashes",
      {
        card: {
          url: "u",
          fetched: true,
          onChainHash: null,
          hashMatches: false,
          selfReferenceMatches: true,
        },
      },
      "card.integrity",
    ],
    [
      "card without badge",
      { card: { ...goodEvidence.card, selfReferenceMatches: false } },
      "card.self_reference",
    ],
    [
      "resolver disagrees",
      { resolver: { reachable: true, badgeValid: false, issues: ["no badge"] } },
      "resolver.agrees",
    ],
    [
      "resolver disagrees silently",
      { resolver: { reachable: true, badgeValid: false, issues: [] } },
      "resolver.agrees",
    ],
    ["no IdP credential", { identity: { status: "absent" } }, "identity.credential"],
    [
      "impersonation",
      { payee: { payTo: SCAMMER, boundAccount: OWNER, boundVia: "agent_wallet", matches: false } },
      "payee.bound",
    ],
    ["no payee", { payee: null }, "payee.bound"],
    [
      "no payment account",
      { payee: { payTo: SCAMMER, boundAccount: null, boundVia: null, matches: false } },
      "payee.bound",
    ],
  ])("denies on %s", (_name, ev, rule) => {
    const d = run(ev);
    expect(d.verdict).toBe("DENY");
    expect(d.failed.map((f) => f.id)).toContain(rule);
  });

  it("fails closed on card.self_reference when the card is missing", () => {
    expect(
      outcome(run({ card: { ...goodEvidence.card, fetched: false } }), "card.self_reference"),
    ).toBe("fail");
  });

  it("treats an unreachable hosted resolver as advisory (local checks stand)", () => {
    const d = run({ resolver: { reachable: false, error: "timeout" } });
    expect(d.verdict).toBe("ALLOW");
    expect(outcome(d, "resolver.agrees")).toBe("skip");
  });

  describe("identity credential modes", () => {
    it("skips when never required", () => {
      expect(
        outcome(
          run({ identity: { status: "absent" } }, { requireIdentityCredential: "never" }),
          "identity.credential",
        ),
      ).toBe("skip");
    });
    it("if-available: skips when the node is unreachable or no checker exists", () => {
      expect(
        outcome(run({ identity: { status: "unavailable", error: "x" } }), "identity.credential"),
      ).toBe("skip");
      expect(outcome(run({ identity: null }), "identity.credential")).toBe("skip");
    });
    it("always: fails when the node is unreachable or no checker exists", () => {
      expect(
        outcome(
          run(
            { identity: { status: "unavailable", error: "x" } },
            { requireIdentityCredential: "always" },
          ),
          "identity.credential",
        ),
      ).toBe("fail");
      expect(
        outcome(
          run({ identity: null }, { requireIdentityCredential: "always" }),
          "identity.credential",
        ),
      ).toBe("fail");
    });
    it("fails when there is no owner to check", () => {
      expect(outcome(run({ record: null }), "identity.credential")).toBe("fail");
    });
  });

  it("can relax badge, card and payee requirements explicitly", () => {
    const d = run(
      {
        tokenAddress: null,
        record: null,
        decoded: null,
        card: {
          url: null,
          fetched: false,
          onChainHash: null,
          hashMatches: false,
          selfReferenceMatches: false,
        },
        payee: null,
        identity: null,
      },
      {
        requireBadge: false,
        requireCardIntegrity: false,
        requirePayeeBinding: false,
        requireIdentityCredential: "never",
      },
    );
    expect(d.verdict).toBe("ALLOW");
    for (const id of [
      "badge.resolves",
      "badge.active",
      "registry.trusted",
      "card.integrity",
      "card.self_reference",
      "resolver.agrees",
      "payee.bound",
    ] as const) {
      expect(outcome(d, id)).toBe("skip");
    }
  });

  it("honours a custom trusted-registry list", () => {
    expect(run({}, { trustedRegistries: ["999,0"] }).failed.map((f) => f.id)).toEqual([
      "registry.trusted",
    ]);
  });

  it("rejects payments on the wrong network", () => {
    expect(
      run({}, {}, { network: "ccd:9dd9ca4d19e9393877d2c44b70f89acb" }).failed.map((f) => f.id),
    ).toEqual(["network.allowed"]);
  });

  it("applies deny- and allow-lists to payTo and owner", () => {
    expect(run({}, { denyAccounts: [OWNER] }).failed.map((f) => f.id)).toEqual([
      "account.denylist",
    ]);
    expect(outcome(run({}, { allowAccounts: [OWNER] }), "account.allowlist")).toBe("pass");
    expect(run({}, { allowAccounts: [SCAMMER] }).failed.map((f) => f.id)).toEqual([
      "account.allowlist",
    ]);
  });

  it("enforces a minimum registration age (fresh-sybil defence)", () => {
    expect(outcome(run({}, { minRegistrationAgeHours: 24 }), "registration.age")).toBe("pass");
    expect(outcome(run({}, { minRegistrationAgeHours: 24 * 30 }), "registration.age")).toBe("fail");
    expect(
      outcome(
        run(
          { record: { ...goodEvidence.record!, registered_at: null } },
          { minRegistrationAgeHours: 1 },
        ),
        "registration.age",
      ),
    ).toBe("fail");
  });

  it("enforces asset allow-list, per-payment cap and missing caps", () => {
    expect(run({}, {}, { asset: "DOGE" }).failed.map((f) => f.id)).toEqual([
      "asset.allowed",
      "amount.cap",
      "budget.daily",
    ]);
    expect(run({}, {}, { amount: "1000001" }).failed.map((f) => f.id)).toContain("amount.cap");
    expect(run({}, {}, { amount: "1000000" }).verdict).toBe("ALLOW");
    expect(run({}, {}, { amount: "1.5" }).failed.map((f) => f.id)).toEqual([
      "amount.cap",
      "budget.daily",
    ]);
  });

  it("enforces the rolling daily budget using the ledger", () => {
    const ledger = new SpendLedger();
    ledger.record("CCD", 4_995_000n, NOW);
    expect(run({}, {}, { amount: "5000" }, ledger).verdict).toBe("ALLOW");
    expect(run({}, {}, { amount: "5001" }, ledger).failed.map((f) => f.id)).toEqual([
      "budget.daily",
    ]);
  });
});
