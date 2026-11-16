import { tokenAddressFromBase58 } from "@concordium/web-sdk";
import type { ContractAddress } from "../networks.js";

export interface DecodedTokenAddress {
  readonly contract: ContractAddress;
  /** Token id as an unsigned 64-bit little-endian integer (CIS-8004 uses TokenIdU64). */
  readonly tokenId: string;
}

/**
 * Decodes a badge locally (Base58Check of 0x02 ‖ ULEB128(index) ‖ ULEB128(subindex) ‖ id),
 * so the registry contract a badge points at is known without trusting any service.
 */
export function decodeTokenAddress(tokenAddress: string): DecodedTokenAddress | null {
  try {
    const { contract, id } = tokenAddressFromBase58(tokenAddress);
    return {
      contract: { index: Number(contract.index), subindex: Number(contract.subindex) },
      tokenId: leHexToDecimal(id),
    };
  } catch {
    return null;
  }
}

function leHexToDecimal(hex: string): string {
  const bytes = hex.match(/../g) ?? [];
  return BigInt("0x" + (bytes.reverse().join("") || "0")).toString();
}
