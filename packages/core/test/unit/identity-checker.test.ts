import { describe, expect, it, vi } from "vitest";
import { GrpcIdentityChecker, StaticIdentityChecker } from "../../src/verifier/identity-checker.js";
import { NETWORKS } from "../../src/networks.js";
import { OWNER } from "../helpers.js";

describe("identity checkers", () => {
  it("StaticIdentityChecker returns table entries, absent otherwise", async () => {
    const c = new StaticIdentityChecker({
      [OWNER]: { status: "verified", identityProviders: [1] },
    });
    expect(await c.check(OWNER)).toEqual({ status: "verified", identityProviders: [1] });
    expect(await c.check("other")).toEqual({ status: "absent" });
  });

  describe("GrpcIdentityChecker", () => {
    const withAccountInfo = (impl: () => Promise<unknown>) => {
      const checker = new GrpcIdentityChecker(NETWORKS.testnet);
      const client = (checker as unknown as { client: { getAccountInfo: unknown } }).client;
      client.getAccountInfo = vi.fn(impl);
      return checker;
    };

    it("reads Identity Provider ids from the account's credentials", async () => {
      const c = withAccountInfo(() =>
        Promise.resolve({
          accountCredentials: {
            0: { v: 0, value: { type: "normal", contents: { ipIdentity: 0 } } },
            1: { v: 0, value: { type: "normal", contents: { ipIdentity: 0 } } },
            2: { v: 0, value: { type: "initial", contents: { ipIdentity: 3 } } },
          },
        }),
      );
      expect(await c.check(OWNER)).toEqual({ status: "verified", identityProviders: [0, 3] });
    });

    it("reports absent for accounts without credentials or unknown accounts", async () => {
      expect(
        await withAccountInfo(() => Promise.resolve({ accountCredentials: {} })).check(OWNER),
      ).toEqual({ status: "absent" });
      expect(
        await withAccountInfo(() => Promise.reject(new Error("account NOT_FOUND"))).check(OWNER),
      ).toEqual({ status: "absent" });
    });

    it("reports unavailable on transport errors", async () => {
      expect(
        await withAccountInfo(() => Promise.reject(new Error("UNAVAILABLE"))).check(OWNER),
      ).toEqual({ status: "unavailable", error: "UNAVAILABLE" });
      expect(
        await withAccountInfo(() => {
          throw "boom"; // eslint-disable-line @typescript-eslint/only-throw-error -- non-Error failure path
        }).check(OWNER),
      ).toEqual({
        status: "unavailable",
        error: "boom",
      });
    });
  });
});
