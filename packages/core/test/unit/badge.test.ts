import { describe, expect, it } from "vitest";
import {
  BADGE_EXTENSION_URI,
  extractCardBadge,
  parseBadge,
  parseCaip10,
} from "../../src/registry/badge.js";
import { decodeTokenAddress } from "../../src/registry/token-address.js";
import { agentCard, badgeFor, OWNER, TESTNET } from "../helpers.js";

describe("parseBadge", () => {
  it("accepts the short Base58Check form", () => {
    expect(parseBadge("JyP9X278CKWoNLAFg5kVr")).toEqual({ tokenAddress: "JyP9X278CKWoNLAFg5kVr" });
  });

  it("accepts the canonical CAIP-19 form and keeps the chain", () => {
    expect(parseBadge(`${TESTNET.caip2}/cis-2:JyP9X278CKWoNLAFg5kVr`)).toEqual({
      tokenAddress: "JyP9X278CKWoNLAFg5kVr",
      chain: TESTNET.caip2,
    });
  });

  it.each(["", "   ", "not a badge!", "0OIl0OIl0OIl0OIl", "x".repeat(60)])(
    "rejects %j",
    (input) => {
      expect(parseBadge(input)).toBeNull();
    },
  );
});

describe("parseCaip10", () => {
  it("splits chain and id", () => {
    expect(parseCaip10(`${TESTNET.caip2}:${OWNER}`)).toEqual({ chain: TESTNET.caip2, id: OWNER });
  });
  it("returns bare ids unchanged", () => {
    expect(parseCaip10(OWNER)).toEqual({ chain: null, id: OWNER });
  });
});

describe("decodeTokenAddress", () => {
  it("decodes the registry contract and token id locally", () => {
    expect(decodeTokenAddress("JyP9X278CKWoNLAFg5kVr")).toEqual({
      contract: { index: 12802, subindex: 0 },
      tokenId: "1190",
    });
  });
  it("round-trips badges built by the SDK", () => {
    expect(decodeTokenAddress(badgeFor(42, { index: 999, subindex: 0 }))).toEqual({
      contract: { index: 999, subindex: 0 },
      tokenId: "42",
    });
  });
  it("returns null for garbage", () => {
    expect(decodeTokenAddress("1111111111111")).toBeNull();
  });
});

describe("extractCardBadge", () => {
  it("reads the normative A2A extension form", () => {
    const badge = badgeFor(7);
    expect(extractCardBadge(JSON.parse(agentCard(badge)))).toEqual({
      badge: { tokenAddress: badge, chain: TESTNET.caip2 },
      ownerAccount: OWNER,
      registry: "12802,0",
      embedding: "extension",
    });
  });

  it("reads the legacy top-level concordium block", () => {
    const card = {
      concordium: { tokenAddress: "JyP9X278CKWoNLAFg5kVr", owner: { account: OWNER } },
    };
    expect(extractCardBadge(card)).toMatchObject({
      badge: { tokenAddress: "JyP9X278CKWoNLAFg5kVr" },
      ownerAccount: OWNER,
      registry: null,
      embedding: "legacy",
    });
  });

  it("handles a pre-registration card whose tokenAddress is null", () => {
    const card = {
      capabilities: { extensions: [{ uri: BADGE_EXTENSION_URI, params: { tokenAddress: null } }] },
    };
    expect(extractCardBadge(card)).toMatchObject({ badge: null, ownerAccount: null });
  });

  it.each([
    null,
    42,
    "card",
    {},
    { capabilities: { extensions: "nope" } },
    { concordium: { owner: 5 } },
  ])("returns null for %j", (card) => {
    expect(extractCardBadge(card)).toBeNull();
  });
});
