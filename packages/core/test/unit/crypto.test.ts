import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "../../src/util/crypto.js";

describe("crypto utils", () => {
  it("computes SHA-256 like sha256sum", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex(new Uint8Array([97, 98, 99]))).toBe(await sha256Hex("abc"));
  });

  it("serialises JSON with sorted keys, recursively, dropping undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[{"y":2,"z":1}]},"b":1}',
    );
  });
});
