import { privateKeyToAddress } from "viem/accounts";
import { elizaLogger } from "@elizaos/core";

/**
 * Get the private key from environment variables
 */
export function getPrivateKey(): `0x${string}` {
  const privateKey = (process.env.ETHEREUM_PRIVATE_KEY ||
    process.env.EVM_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    process.env.WALLET_PRIVATE_KEY) as `0x${string}` | undefined;
  
  if (!privateKey) {
    throw new Error("Missing private key for trading");
  }
  
  return privateKey;
}

/**
 * Get wallet address from private key environment variables
 */
export function getWalletAddress(): string {
  try {
    const privateKey = getPrivateKey();
    return privateKeyToAddress(privateKey).toLowerCase();
  } catch (error) {
    elizaLogger.error("[Blockchain] Failed to get wallet address:", error);
    throw error;
  }
}

/**
 * Get RPC URL from environment variables
 */
export function getRpcUrl(): string {
  return process.env.EVM_PROVIDER_URL || "https://arb1.arbitrum.io/rpc";
}

/**
 * Get contract addresses from environment variables
 */
export function getContractAddresses() {
  return {
    UMA_RESOLVER: (process.env.UMA_RESOLVER_ADDRESS || "0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9") as `0x${string}`,
    PREDICTION_MARKET: (process.env.PREDICTION_MARKET_ADDRESS || "0xb04841cad1147675505816e2ec5c915430857b40") as `0x${string}`,
    USDE_TOKEN: (process.env.USDE_TOKEN_ADDRESS || "0xfEb8C4d5eFbaFf6e928eA090Bc660c363f883DBA") as `0x${string}`,
    // Optional override for the signature verifying contract; defaults to market contract
    VERIFIER_CONTRACT: (process.env.VERIFIER_CONTRACT_ADDRESS || process.env.SIGNATURE_PROCESSOR_ADDRESS || process.env.PREDICTION_MARKET_ADDRESS || "0xb04841cad1147675505816e2ec5c915430857b40") as `0x${string}`,
    MARKET_CONTRACT: (process.env.MARKET_CONTRACT_ADDRESS || process.env.PREDICTION_MARKET_ADDRESS || "0xb04841cad1147675505816e2ec5c915430857b40") as `0x${string}`,
  };
}

/**
 * Get trading configuration from environment variables
 */
export function getTradingConfig() {
  return {
    wagerAmount: process.env.PARLAY_WAGER_AMOUNT || "1000000000000000000",
    minConfidence: parseFloat(process.env.MIN_PARLAY_CONFIDENCE || "0.6"),
    auctionTimeoutMs: parseInt(process.env.PARLAY_AUCTION_TIMEOUT_MS || "300000"),
    keepAliveMs: parseInt(process.env.PARLAY_KEEPALIVE_INTERVAL_MS || "20000"),
    statusIntervalMs: parseInt(process.env.PARLAY_STATUS_INTERVAL_MS || "30000"),
    approvalAmount: process.env.USDE_APPROVAL_AMOUNT || "1000000000000000000000000",
  };
}

/**
 * Get API endpoints from environment variables
 */
export function getApiEndpoints() {
  return {
    sapienceWs: process.env.SAPIENCE_WS_URL || "wss://api.sapience.xyz/auction",
    sapienceGraphql: process.env.SAPIENCE_GRAPHQL_URL || "https://api.sapience.xyz/graphql",
  };
}

/**
 * Create a standardized viem public client for Arbitrum
 */
export async function createArbitrumPublicClient(rpcUrl?: string) {
  const { createPublicClient, http } = await import("viem");
  const { arbitrum } = await import("viem/chains");
  
  return createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl || getRpcUrl())
  });
}

/**
 * Create a standardized viem wallet client for Arbitrum
 */
export async function createArbitrumWalletClient(privateKey?: `0x${string}`, rpcUrl?: string) {
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { arbitrum } = await import("viem/chains");
  
  const key = privateKey || getPrivateKey();
  const account = privateKeyToAccount(key);
  
  return createWalletClient({
    account,
    chain: arbitrum,
    transport: http(rpcUrl || getRpcUrl())
  });
}