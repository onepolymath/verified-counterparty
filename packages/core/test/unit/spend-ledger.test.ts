import { describe, expect, it } from "vitest";
import { SpendLedger } from "../../src/policy/spend-ledger.js";

describe("SpendLedger", () => {
  it("sums spend per asset within the rolling window", () => {
    const l = new SpendLedger(1000);
    l.record("CCD", 5n, new Date(0));
    l.record("CCD", 7n, new Date(500));
    l.record("EURR", 100n, new Date(500));
    expect(l.spentInWindow("CCD", new Date(900))).toBe(12n);
    expect(l.spentInWindow("CCD", new Date(1200))).toBe(7n);
    expect(l.spentInWindow("EURR", new Date(1200))).toBe(100n);
    expect(l.spentInWindow("CCD", new Date(5000))).toBe(0n);
  });

  it("rejects negative amounts", () => {
    expect(() => {
      new SpendLedger().record("CCD", -1n, new Date());
    }).toThrow(RangeError);
  });
});
