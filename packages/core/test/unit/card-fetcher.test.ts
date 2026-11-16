import { describe, expect, it } from "vitest";
import { fetchCard } from "../../src/verifier/card-fetcher.js";
import { sha256Hex } from "../../src/util/crypto.js";
import { routedFetch } from "../helpers.js";

describe("fetchCard", () => {
  it("hashes the exact served bytes", async () => {
    const body = '{"name":"x"}\n';
    const out = await fetchCard(
      "https://a.example/card.json",
      routedFetch({ "https://a.example/card.json": body }),
    );
    expect(out).toEqual({
      ok: true,
      sha256: await sha256Hex(body),
      json: { name: "x" },
      bytes: body.length,
    });
  });

  it("still hashes non-JSON bodies", async () => {
    const out = await fetchCard(
      "https://a.example/c",
      routedFetch({ "https://a.example/c": "plain" }),
    );
    expect(out).toMatchObject({ ok: true, json: null });
  });

  it.each([
    ["not a url", "agent_uri is not a valid URL"],
    ["http://evil.example/card.json", "agent_uri must use https"],
  ])("rejects %s", async (url, error) => {
    expect(await fetchCard(url, routedFetch({}))).toEqual({ ok: false, error });
  });

  it("reports HTTP errors", async () => {
    expect(await fetchCard("https://a.example/gone", routedFetch({}))).toEqual({
      ok: false,
      error: "card URL returned HTTP 404",
    });
  });

  it("refuses oversized cards", async () => {
    const big = "x".repeat(300 * 1024);
    expect(
      await fetchCard("https://a.example/big", routedFetch({ "https://a.example/big": big })),
    ).toEqual({ ok: false, error: "card exceeds 256 KiB" });
  });

  it("reports transport failures", async () => {
    const out = await fetchCard("https://a.example/x", () =>
      Promise.reject(new Error("ECONNRESET")),
    );
    expect(out).toEqual({ ok: false, error: "card fetch failed: ECONNRESET" });
  });

  it("allows plain http only for localhost", async () => {
    const out = await fetchCard(
      "http://127.0.0.1:9/card",
      routedFetch({ "http://127.0.0.1:9/card": "{}" }),
    );
    expect(out.ok).toBe(true);
  });
});
