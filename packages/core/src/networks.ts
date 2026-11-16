/**
 * Static Concordium network facts. Everything here is public, chain-derived data:
 * the values come from the hosted Agent Registry `contract_info` tool and the
 * `@x402/concordium` constants.
 */
export type NetworkName = "testnet" | "mainnet";

export interface NetworkInfo {
  readonly name: NetworkName;
  /** CAIP-2 chain id, used by x402 (`network`) and by badge CAIP identifiers. */
  readonly caip2: `ccd:${string}`;
  /** Official CIS-8004 Agent Registry contract (index, subindex). */
  readonly cis8004: ContractAddress;
  /** Official CIS-8 External Key Registry contract. */
  readonly cis8: ContractAddress;
  readonly grpc: { readonly host: string; readonly port: number };
  readonly explorer: string;
  readonly ccdscan: string;
}

export interface ContractAddress {
  readonly index: number;
  readonly subindex: number;
}

export const NETWORKS: Readonly<Record<NetworkName, NetworkInfo>> = {
  testnet: {
    name: "testnet",
    caip2: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    cis8004: { index: 12802, subindex: 0 },
    cis8: { index: 12801, subindex: 0 },
    grpc: { host: "grpc.testnet.concordium.com", port: 20000 },
    explorer: "https://ccdexplorer.io/testnet",
    ccdscan: "https://testnet.ccdscan.io",
  },
  mainnet: {
    name: "mainnet",
    caip2: "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
    cis8004: { index: 10082, subindex: 0 },
    cis8: { index: 10081, subindex: 0 },
    grpc: { host: "grpc.mainnet.concordium.software", port: 20000 },
    explorer: "https://ccdexplorer.io/mainnet",
    ccdscan: "https://ccdscan.io",
  },
};

export function networkByCaip2(caip2: string): NetworkInfo | undefined {
  return Object.values(NETWORKS).find((n) => n.caip2 === caip2);
}

export function formatContract(c: ContractAddress): string {
  return `${c.index},${c.subindex}`;
}

export const explorerLinks = {
  account: (n: NetworkInfo, address: string) => `${n.explorer}/account/${address}`,
  contract: (n: NetworkInfo, c: ContractAddress) =>
    `${n.explorer}/instance/${c.index}/${c.subindex}`,
  transaction: (n: NetworkInfo, hash: string) => `${n.explorer}/transaction/${hash}`,
} as const;
