import { ContractAddress, tokenAddressToBase58 } from "@concordium/web-sdk";
import type { AgentRecord, BadgeVerdict, RegistryClient } from "../src/registry/registry-client.js";
import { BADGE_EXTENSION_URI } from "../src/registry/badge.js";
import { NETWORKS } from "../src/networks.js";
import { sha256Hex } from "../src/util/crypto.js";
import type { FetchLike } from "../src/util/http.js";

export const TESTNET = NETWORKS.testnet;
export const OWNER = "2yR1ck8SshaDaK1QbjkRbafjoRtzSVJ1LSSyn23AdkWazZ4Rqh";
/** Deterministic, keyless address (sha256 of a label): nobody controls it. */
export const SCAMMER = "3x7cPbKo4A7vbTpsdh2QQpzWwZmodeYP6ZEgaUQWG23BEAfGF6";
export const NOW = new Date("2026-11-20T12:00:00.000Z");

export function badgeFor(tokenId: number, contract = TESTNET.cis8004): string {
  const id = Buffer.alloc(8);
  id.writeBigUInt64LE(BigInt(tokenId));
  return tokenAddressToBase58({
    contract: ContractAddress.create(contract.index, contract.subindex),
    id: id.toString("hex"),
  });
}

export function agentCard(tokenAddress: string, owner = OWNER, name = "Honest Data Agent"): string {
  return JSON.stringify({
    name,
    description: "Sells verified market data over x402",
    capabilities: {
      extensions: [
        {
          uri: BADGE_EXTENSION_URI,
          required: false,
          params: {
            tokenAddress: `${TESTNET.caip2}/cis-2:${tokenAddress}`,
            owner: { account: `${TESTNET.caip2}:${owner}` },
            contracts: { cis8004: `${TESTNET.caip2}:12802.0`, cis8: `${TESTNET.caip2}:12801.0` },
          },
        },
      ],
    },
  });
}

export interface AgentFixture {
  readonly badge: string;
  readonly record: AgentRecord;
  readonly cardUrl: string;
  readonly cardBody: string;
}

/** A fully consistent, valid agent: on-chain record, served card, matching hash. */
export async function honestAgent(
  tokenId = 1190,
  overrides: Partial<AgentRecord> = {},
): Promise<AgentFixture> {
  const badge = badgeFor(tokenId);
  const cardUrl = `https://agent-${tokenId}.example/.well-known/agent-card.json`;
  const cardBody = agentCard(badge, overrides.owner_account ?? OWNER);
  const record: AgentRecord = {
    network: "testnet",
    token_address: badge,
    token_id: String(tokenId),
    owner_account: OWNER,
    agent_uri: cardUrl,
    metadata_hash_hex: await sha256Hex(cardBody),
    agent_wallet: OWNER,
    status: "Active",
    registered_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
  return { badge, record, cardUrl, cardBody };
}

export class FakeRegistry implements RegistryClient {
  readonly records = new Map<string, AgentRecord>();
  readonly verdicts = new Map<string, BadgeVerdict>();
  failWith: Error | null = null;
  resolverFailWith: Error | null = null;
  calls = 0;

  add(record: AgentRecord, verdict: Partial<BadgeVerdict> = {}): this {
    this.records.set(record.token_address, record);
    this.verdicts.set(record.token_address, {
      badge_valid: true,
      checks: {},
      issues: [],
      ...verdict,
    });
    return this;
  }

  agentByTokenAddress(tokenAddress: string): Promise<AgentRecord | null> {
    this.calls++;
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(this.records.get(tokenAddress) ?? null);
  }

  checkBadge(tokenAddress: string): Promise<BadgeVerdict> {
    if (this.resolverFailWith) return Promise.reject(this.resolverFailWith);
    return Promise.resolve(
      this.verdicts.get(tokenAddress) ?? {
        badge_valid: false,
        checks: {},
        issues: [{ severity: "error", message: "no CIS-8004 record found for this token" }],
      },
    );
  }
}

type Route =
  | string
  | { status: number; body?: string; headers?: Record<string, string> }
  | (() => Response | Promise<Response>);

/** Tiny router-backed fetch for unit tests. Unknown URLs return 404. */
export function routedFetch(routes: Record<string, Route>): FetchLike & { hits: string[] } {
  const hits: string[] = [];
  const f = (async (input: string | URL) => {
    const url = String(input);
    hits.push(url);
    const route = routes[url];
    if (route === undefined) return new Response("not found", { status: 404 });
    if (typeof route === "function") return route();
    if (typeof route === "string") return new Response(route, { status: 200 });
    return new Response(route.body ?? "", { status: route.status, headers: route.headers ?? {} });
  }) as FetchLike & { hits: string[] };
  f.hits = hits;
  return f;
}
