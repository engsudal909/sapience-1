import { elizaLogger } from "@elizaos/core";
import { createArbitrumPublicClient, createArbitrumWalletClient, getContractAddresses, getTradingConfig } from "./blockchain.js";

interface Bid {
  auctionId: string;
  maker: string;
  makerWager: string;
  makerDeadline: number;
  makerSignature: string;
  makerNonce: number;
  taker: string;
  takerCollateral: string;
  wager?: string; // fallback for legacy compatibility
  resolver: string;
  encodedPredictedOutcomes: string;
  predictedOutcomes: string[];
}

/**
 * Get the current maker nonce from the PredictionMarket contract
 */
export async function getCurrentMakerNonce(walletAddress: string, rpcUrl?: string): Promise<number> {
  try {
    const publicClient = await createArbitrumPublicClient(rpcUrl);
    const { PREDICTION_MARKET } = getContractAddresses();
    
    const nonce = await publicClient.readContract({
      address: PREDICTION_MARKET,
      abi: [{
        name: "nonces",
        type: "function",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view"
      }],
      functionName: 'nonces',
      args: [walletAddress as `0x${string}`],
    }) as bigint;

    return Number(nonce);
  } catch (error) {
    elizaLogger.error("[Contracts] Failed to get maker nonce:", error);
    return 0;
  }
}

/**
 * Ensure ERC-20 token approval for USDe before trading
 */
export async function ensureTokenApproval({
  privateKey,
  rpcUrl,
  amount,
}: {
  privateKey: `0x${string}`;
  rpcUrl?: string;
  amount: string;
}): Promise<void> {
  try {
    const { erc20Abi } = await import("viem");
    const { USDE_TOKEN, PREDICTION_MARKET } = getContractAddresses();
    const { approvalAmount } = getTradingConfig();

    const publicClient = await createArbitrumPublicClient(rpcUrl);
    const walletClient = await createArbitrumWalletClient(privateKey, rpcUrl);

    const allowance = await publicClient.readContract({
      address: USDE_TOKEN,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [walletClient.account.address, PREDICTION_MARKET],
    }) as bigint;

    const requiredAmount = BigInt(amount);
    elizaLogger.info(`[Contracts] Current allowance: ${allowance}, required: ${requiredAmount}`);

    if (allowance >= requiredAmount) {
      elizaLogger.info("[Contracts] Sufficient allowance already exists");
      return;
    }

    elizaLogger.info("[Contracts] Approving USDe tokens for PredictionMarket contract...");

    const hash = await walletClient.writeContract({
      address: USDE_TOKEN,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PREDICTION_MARKET, BigInt(approvalAmount)],
    });

    elizaLogger.info(`[Contracts] Approval transaction submitted: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    elizaLogger.info("[Contracts] Approval confirmed");
  } catch (error) {
    elizaLogger.error("[Contracts] Failed to ensure token approval:", error);
    throw error;
  }
}

/**
 * Build mint transaction calldata for PredictionMarket contract
 */
export async function buildMintCalldata({
  bid,
  maker,
}: {
  bid: Bid;
  maker: string;
}): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import("viem");
  const { UMA_RESOLVER } = getContractAddresses();
  
  // Contract field names haven't changed - map API roles to contract roles:
  // Contract "maker" = API "taker" (auction creator)
  // Contract "taker" = API "maker" (bidder)
  const mintRequest = {
    encodedPredictedOutcomes: bid.encodedPredictedOutcomes || "0x",
    resolver: bid.resolver || UMA_RESOLVER,
<<<<<<< Current (Your changes)
    makerCollateral: BigInt(bid.makerWager || '0'),
    takerCollateral: BigInt(bid.takerCollateral || bid.wager || '0'),
    maker: bid.maker || maker,
    taker: bid.taker,
    makerNonce: BigInt(bid.makerNonce || 0),
    takerSignature: bid.makerSignature || "0x",
    takerDeadline: BigInt(bid.makerDeadline || 0),
=======
    makerCollateral: BigInt(bid.takerCollateral || bid.wager || '0'), // Contract maker = API taker (auction creator's wager)
    takerCollateral: BigInt(bid.makerWager || '0'), // Contract taker = API maker (bidder's wager)
    maker: maker, // Contract maker = API taker (auction creator - passed as parameter)
    taker: bid.maker, // Contract taker = API maker (bidder)
    makerNonce: BigInt(0), // TODO: Need takerNonce from auction, not from bid
    takerSignature: bid.makerSignature || "0x", // Contract taker = API maker (bidder's signature)
    takerDeadline: BigInt(bid.makerDeadline || 0), // Contract taker = API maker (bidder's deadline)
>>>>>>> Incoming (Background Agent changes)
    refCode: "0x0000000000000000000000000000000000000000000000000000000000000000"
  };
  
  return encodeFunctionData({
    abi: [{
      name: "mint",
      type: "function", 
      inputs: [
        { name: "mintPredictionRequestData", type: "tuple", components: [
          { name: "encodedPredictedOutcomes", type: "bytes" },
          { name: "resolver", type: "address" },
          { name: "makerCollateral", type: "uint256" },
          { name: "takerCollateral", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "taker", type: "address" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerSignature", type: "bytes" },
          { name: "takerDeadline", type: "uint256" },
          { name: "refCode", type: "bytes32" },
        ]},
      ],
      outputs: [
        { name: "makerNftTokenId", type: "uint256" },
        { name: "takerNftTokenId", type: "uint256" }
      ],
    }],
    functionName: "mint",
    args: [mintRequest],
  });
}