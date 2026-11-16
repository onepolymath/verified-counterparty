import { AccountAddress, ConcordiumGRPCWebClient } from "@concordium/web-sdk";
import type { NetworkInfo } from "../networks.js";

export type IdentityEvidence =
  | { readonly status: "verified"; readonly identityProviders: readonly number[] }
  | { readonly status: "absent" }
  | { readonly status: "unavailable"; readonly error: string };

/**
 * Every Concordium account is opened from an identity issued off-chain by an
 * Identity Provider; the account's credentials carry that provider's id on chain.
 * This checker reads them, proving an accountable, ID-verified person is behind
 * the account without learning who they are.
 */
export interface IdentityChecker {
  check(account: string): Promise<IdentityEvidence>;
}

export class GrpcIdentityChecker implements IdentityChecker {
  private readonly client: ConcordiumGRPCWebClient;

  constructor(
    network: NetworkInfo,
    private readonly timeoutMs = 8_000,
  ) {
    this.client = new ConcordiumGRPCWebClient(`https://${network.grpc.host}`, network.grpc.port, {
      timeout: timeoutMs,
    });
  }

  async check(account: string): Promise<IdentityEvidence> {
    try {
      const info = await this.client.getAccountInfo(AccountAddress.fromBase58(account));
      const ips = Object.values(info.accountCredentials)
        .map((c) => c.value.contents.ipIdentity)
        .filter((ip): ip is number => typeof ip === "number");
      return ips.length > 0
        ? { status: "verified", identityProviders: [...new Set(ips)] }
        : { status: "absent" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/not found|NOT_FOUND/i.test(message)) return { status: "absent" };
      return { status: "unavailable", error: message.slice(0, 200) };
    }
  }
}

/** For tests and offline demos. */
export class StaticIdentityChecker implements IdentityChecker {
  constructor(private readonly table: Readonly<Record<string, IdentityEvidence>>) {}
  check(account: string): Promise<IdentityEvidence> {
    return Promise.resolve(this.table[account] ?? { status: "absent" });
  }
}
