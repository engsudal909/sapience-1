import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
// Removed Socket.IO - using native WebSocket instead
import { privateKeyToAddress } from "viem/accounts";

// Sapience WebSocket endpoint for parlay auctions
// Note: This may need to be updated with the correct production URL
const SAPIENCE_WS_URL = "wss://api.sapience.xyz/auction";

interface ParlayTradingConfig {
  enabled: boolean;
  wagerAmount: string; // In USDC units (6 decimals), default $1
  minProbabilityThreshold: number; // Only trade if confidence is above this
  maxSlippage: number; // Maximum acceptable slippage %
}

interface Bid {
  id: string;
  maker: string;
  wager: string;
  deadline: number;
  outcome: boolean;
  price: string;
  collateralToken: string;
  predictionMarket: string;
}

interface AuctionParams {
  maker: string;
  wager: string;
  resolver: string;
  outcomes: boolean[];
  makerNonce: string;
}

export const parlayTradingAction: Action = {
  name: "PARLAY_TRADING",
  description: "Make $1 wagers on parlays based on forecasts (>50% = YES, <50% = NO)",
  similes: ["trade parlay", "make wager", "place bet"],

  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      // Check if trading is enabled via environment variable
      const tradingEnabled = process.env.ENABLE_PARLAY_TRADING === "true";
      if (!tradingEnabled) {
        elizaLogger.info("[ParlayTrading] Trading disabled via ENABLE_PARLAY_TRADING env var");
        await callback?.({
          text: "Parlay trading is disabled. Set ENABLE_PARLAY_TRADING=true to enable.",
          content: {},
        });
        return;
      }

      // Parse the message content to extract market data and prediction
      const text = message.content?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        await callback?.({
          text: 'Provide market data and prediction: {"market": {...}, "prediction": {...}}',
          content: {},
        });
        return;
      }

      const data = JSON.parse(jsonMatch[0]) as {
        market: any;
        prediction: {
          probability: number;
          reasoning: string;
          confidence: number;
        };
      };

      const { market, prediction } = data;

      // Get trading configuration
      const config: ParlayTradingConfig = {
        enabled: true,
        wagerAmount: process.env.PARLAY_WAGER_AMOUNT || "1000000", // $1 in USDC (6 decimals)
        minProbabilityThreshold: parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6"),
        maxSlippage: parseFloat(process.env.MAX_TRADING_SLIPPAGE || "5"), // 5%
      };

      // Check if we should trade based on confidence
      if (prediction.confidence < config.minProbabilityThreshold) {
        elizaLogger.info(
          `[ParlayTrading] Skipping trade - confidence ${prediction.confidence} below threshold ${config.minProbabilityThreshold}`,
        );
        await callback?.({
          text: `Skipping trade: confidence ${prediction.confidence} below threshold ${config.minProbabilityThreshold}`,
          content: {},
        });
        return;
      }

      // Determine trading direction: >50% = YES, <50% = NO
      const buyYes = prediction.probability > 50;
      const outcome = buyYes;

      elizaLogger.info(
        `[ParlayTrading] Trading decision: ${buyYes ? "YES" : "NO"} (${prediction.probability}% confidence: ${prediction.confidence})`,
      );

      // Get wallet details
      const privateKey = (process.env.ETHEREUM_PRIVATE_KEY ||
        process.env.EVM_PRIVATE_KEY ||
        process.env.PRIVATE_KEY ||
        process.env.WALLET_PRIVATE_KEY) as `0x${string}` | undefined;
      
      if (!privateKey) {
        throw new Error("Missing private key for trading");
      }

      const walletAddress = privateKeyToAddress(privateKey);
      const rpcUrl = process.env.EVM_PROVIDER_URL || "https://arb1.arbitrum.io/rpc";

      // Start auction via WebSocket
      const auctionResult = await startAuction({
        market,
        prediction,
        outcome,
        walletAddress,
        wagerAmount: config.wagerAmount,
        rpcUrl,
      });

      if (auctionResult.success) {
        elizaLogger.info(
          `[ParlayTrading] Trade executed successfully: ${auctionResult.txHash}`,
        );
        await callback?.({
          text: `Trade executed: ${buyYes ? "YES" : "NO"} position for $1 on "${market.question}" (TX: ${auctionResult.txHash})`,
          content: {
            success: true,
            direction: buyYes ? "YES" : "NO",
            probability: prediction.probability,
            confidence: prediction.confidence,
            txHash: auctionResult.txHash,
            market: market.question,
          },
        });
      } else {
        throw new Error(auctionResult.error || "Auction failed");
      }
    } catch (err: any) {
      elizaLogger.error("[ParlayTrading] Trading failed:", err);
      await callback?.({
        text: `Trading failed: ${err?.message}`,
        content: { success: false, error: err?.message },
      });
    }
  },
};

async function startAuction({
  market,
  prediction,
  outcome,
  walletAddress,
  wagerAmount,
  rpcUrl,
}: {
  market: any;
  prediction: any;
  outcome: boolean;
  walletAddress: string;
  wagerAmount: string;
  rpcUrl: string;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      // Connect to Sapience WebSocket using native WebSocket
      const socket = new WebSocket(SAPIENCE_WS_URL);

      let timeoutId: NodeJS.Timeout;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };

      const resolveOnce = (result: { success: boolean; txHash?: string; error?: string }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      // Set timeout for the entire auction process
      timeoutId = setTimeout(() => {
        resolveOnce({ success: false, error: "Auction timeout" });
      }, 30000); // 30 second timeout

      socket.onopen = () => {
        elizaLogger.info("[ParlayTrading] Connected to auction WebSocket");

        // Generate maker nonce (timestamp + random)
        const makerNonce = Date.now().toString() + Math.random().toString(36).substring(2);

        // Start auction with proper message format
        const auctionMessage = {
          type: "auction.start",
          payload: {
            maker: walletAddress,
            wager: wagerAmount,
            resolver: market.marketGroupAddress || market.contractAddress,
            outcomes: [outcome], // Single outcome for this prediction
            makerNonce,
          },
        };

        elizaLogger.info(`[ParlayTrading] Starting auction with params: ${JSON.stringify(auctionMessage)}`);
        socket.send(JSON.stringify(auctionMessage));
      };

      socket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          elizaLogger.info(`[ParlayTrading] Received message: ${JSON.stringify(message)}`);

          if (message.type === "auction.ack") {
            elizaLogger.info(`[ParlayTrading] Auction acknowledged: ${JSON.stringify(message.payload)}`);
          } else if (message.type === "auction.bids") {
            const bids = message.payload?.bids || [];
            elizaLogger.info(`[ParlayTrading] Received ${bids.length} bids`);

            if (bids.length === 0) {
              resolveOnce({ success: false, error: "No bids received" });
              return;
            }

            // Select best bid (filtering and sorting handled in selectBestBid)
            const bestBid = selectBestBid(bids, outcome);
            elizaLogger.info(`[ParlayTrading] Selected best bid: ${JSON.stringify(bestBid)}`);

            // Accept the bid by executing the mint transaction
            const privateKey = process.env.ETHEREUM_PRIVATE_KEY || process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY || process.env.WALLET_PRIVATE_KEY;
            if (!privateKey) {
              throw new Error("Missing private key for trading");
            }
            const txHash = await acceptBid({
              bid: bestBid,
              privateKey,
              rpcUrl,
            });

            resolveOnce({ success: true, txHash });
          } else if (message.type === "auction.error") {
            elizaLogger.error("[ParlayTrading] Auction error:", message.payload);
            resolveOnce({ success: false, error: message.payload?.message || "Auction error" });
          }
        } catch (error: any) {
          elizaLogger.error("[ParlayTrading] Error processing message:", error);
          resolveOnce({ success: false, error: error.message });
        }
      };

      socket.onerror = (error: any) => {
        elizaLogger.error("[ParlayTrading] WebSocket error:", error);
        resolveOnce({ success: false, error: "WebSocket error" });
      };

      socket.onclose = (event) => {
        elizaLogger.info(`[ParlayTrading] WebSocket closed: ${event.code} ${event.reason}`);
        if (!resolved) {
          if (event.code === 1006) {
            elizaLogger.warn("[ParlayTrading] Connection closed abnormally - server may not be available");
            resolveOnce({ success: false, error: "Auction service not available" });
          } else {
            resolveOnce({ success: false, error: "WebSocket disconnected" });
          }
        }
      };
    } catch (error: any) {
      resolve({ success: false, error: error.message });
    }
  });
}

function selectBestBid(bids: Bid[], outcome: boolean): Bid {
  // Filter bids by current timestamp (as per documentation)
  const now = Date.now() / 1000;
  const validBids = bids.filter((bid) => bid.deadline > now);
  
  if (validBids.length === 0) {
    throw new Error("No valid bids available");
  }

  // Sort bids by wager amount (as per documentation)
  const sortedBids = validBids.sort((a, b) => {
    const wagerA = parseFloat(a.wager);
    const wagerB = parseFloat(b.wager);
    return wagerB - wagerA; // Highest wager first
  });

  // Return the "best" bid (highest valid wager)
  return sortedBids[0];
}

async function acceptBid({
  bid,
  privateKey,
  rpcUrl,
}: {
  bid: Bid;
  privateKey: string;
  rpcUrl: string;
}): Promise<string> {
  try {
    const { submitTransaction } = await loadSdk();

    // First, approve the collateral token for the PredictionMarket contract
    const approveCalldata = await buildApproveCalldata({
      tokenAddress: bid.collateralToken,
      spender: bid.predictionMarket,
      amount: bid.wager,
    });

    elizaLogger.info("[ParlayTrading] Approving collateral token...");
    const approveTx = await submitTransaction({
      rpc: rpcUrl,
      privateKey: privateKey as `0x${string}`,
      tx: {
        to: bid.collateralToken as `0x${string}`,
        data: approveCalldata,
        value: "0",
      },
    });

    elizaLogger.info(`[ParlayTrading] Approval TX: ${approveTx.hash}`);

    // Wait a moment for approval to be mined
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Now call PredictionMarket.mint() with the bid details
    const mintCalldata = await buildMintCalldata({
      bid,
      maker: privateKeyToAddress(privateKey as `0x${string}`),
    });

    elizaLogger.info("[ParlayTrading] Executing mint transaction...");
    const mintTx = await submitTransaction({
      rpc: rpcUrl,
      privateKey: privateKey as `0x${string}`,
      tx: {
        to: bid.predictionMarket as `0x${string}`,
        data: mintCalldata,
        value: "0",
      },
    });

    elizaLogger.info(`[ParlayTrading] Mint TX: ${mintTx.hash}`);
    return mintTx.hash;
  } catch (error: any) {
    elizaLogger.error("[ParlayTrading] Failed to accept bid:", error);
    throw error;
  }
}

async function buildApproveCalldata({
  tokenAddress,
  spender,
  amount,
}: {
  tokenAddress: string;
  spender: string;
  amount: string;
}): Promise<`0x${string}`> {
  // ERC20 approve function signature: approve(address,uint256)
  const { encodeFunctionData } = await import("viem");
  
  return encodeFunctionData({
    abi: [
      {
        name: "approve",
        type: "function",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [spender as `0x${string}`, BigInt(amount)],
  });
}

async function buildMintCalldata({
  bid,
  maker,
}: {
  bid: Bid;
  maker: string;
}): Promise<`0x${string}`> {
  // Build mint request with structured parameters as per documentation
  const { encodeFunctionData } = await import("viem");
  
  // Mint request structure from documentation
  const mintRequest = {
    predictedOutcomes: [bid.outcome],
    resolver: bid.predictionMarket, // Use the predictionMarket from bid
    makerCollateral: BigInt(bid.wager),
    takerCollateral: BigInt(bid.wager),
    makerSignature: "0x", // Placeholder - would need actual signature
    takerSignature: "0x", // Placeholder - would need actual signature  
    deadline: BigInt(bid.deadline),
  };
  
  // Simplified ABI for PredictionMarket.mint()
  return encodeFunctionData({
    abi: [
      {
        name: "mint",
        type: "function",
        inputs: [
          { name: "request", type: "tuple", components: [
            { name: "predictedOutcomes", type: "bool[]" },
            { name: "resolver", type: "address" },
            { name: "makerCollateral", type: "uint256" },
            { name: "takerCollateral", type: "uint256" },
            { name: "makerSignature", type: "bytes" },
            { name: "takerSignature", type: "bytes" },
            { name: "deadline", type: "uint256" },
          ]},
        ],
        outputs: [],
      },
    ],
    functionName: "mint",
    args: [mintRequest],
  });
}

export default parlayTradingAction;