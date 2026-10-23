import { createPublicClient, fallback, http, parseAbi, type PublicClient } from "viem";
import { base, baseSepolia } from "viem/chains";

export const NETWORKS = {
  "eip155:8453": {
    chain: base,
    rpc: (process.env.BASE_RPC_URL || "https://mainnet.base.org,https://base.drpc.org").split(","),
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    /** Chainlink USDC / USD Data Feed on Base mainnet */
    usdcUsdFeed: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    explorer: "https://basescan.org",
  },
  "eip155:84532": {
    chain: baseSepolia,
    rpc: (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org,https://base-sepolia.drpc.org").split(","),
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    /** Chainlink USDC / USD Data Feed on Base Sepolia */
    usdcUsdFeed: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
    explorer: "https://sepolia.basescan.org",
  },
} as const;
export type NetworkId = keyof typeof NETWORKS;

export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const AGGREGATOR_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 _roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
]);

const clients = new Map<string, PublicClient>();
export function client(network: NetworkId): PublicClient {
  if (!clients.has(network)) {
    const n = NETWORKS[network];
    clients.set(network, createPublicClient({ chain: n.chain, transport: fallback(n.rpc.map((u) => http(u, { timeout: 15000, retryCount: 1 }))) }) as PublicClient);
  }
  return clients.get(network)!;
}
