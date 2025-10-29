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
import { encodeAbiParameters } from "viem";

// Sapience WebSocket endpoint for parlay auctions
// Note: This may need to be updated with the correct production URL
const SAPIENCE_WS_URL = "wss://api.sapience.xyz/auction";

interface ParlayTradingConfig {
  enabled: boolean;
  wagerAmount: string; // In USDe units (18 decimals), default $1
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
  description: "Start parlay auction with 3+ legs and accept best bid from takers",
  similes: ["trade parlay", "make parlay", "start auction", "bet parlay"],

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

      // Parse parlay data from message - expect multiple market predictions
      const text = message.content?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        await callback?.({
          text: 'Provide parlay data: {"markets": [...], "predictions": [...]}',
          content: {},
        });
        return;
      }

      const data = JSON.parse(jsonMatch[0]) as {
        markets: any[];
        predictions: {
          probability: number;
          reasoning: string;
          confidence: number;
          market: string;
        }[];
      };

      const { markets, predictions } = data;

      // Validate we have at least 3 legs for parlay
      if (!markets || !predictions || markets.length < 3 || predictions.length < 3) {
        await callback?.({
          text: "Parlay requires at least 3 market predictions",
          content: {},
        });
        return;
      }

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
      const wagerAmount = process.env.PARLAY_WAGER_AMOUNT || "1000000000000000000"; // $1

      elizaLogger.info(`[ParlayTrading] Starting parlay auction with ${markets.length} legs`);

      // Start auction as maker
      const auctionResult = await startParlayAuction({
        markets,
        predictions,
        walletAddress,
        wagerAmount,
        rpcUrl,
      });

      if (auctionResult.success) {
        elizaLogger.info(
          `[ParlayTrading] Parlay trade executed successfully: ${auctionResult.txHash}`,
        );
        await callback?.({
          text: `Parlay executed: ${markets.length} legs, wager $1 (TX: ${auctionResult.txHash})`,
          content: {
            success: true,
            legs: markets.length,
            predictions: predictions.map(p => ({ market: p.market, probability: p.probability })),
            txHash: auctionResult.txHash,
          },
        });
      } else {
        throw new Error(auctionResult.error || "Parlay auction failed");
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

async function startParlayAuction({
  markets,
  predictions,
  walletAddress,
  wagerAmount,
  rpcUrl,
}: {
  markets: any[];
  predictions: any[];
  walletAddress: string;
  wagerAmount: string;
  rpcUrl: string;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      // Connect to Sapience WebSocket as a maker
      const socket = new WebSocket(SAPIENCE_WS_URL);

      let timeoutId: NodeJS.Timeout;
      let resolved = false;
      let auctionId: string | null = null;
      let keepAliveInterval: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };

      let resolveOnce = (result: { success: boolean; txHash?: string; error?: string }) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      // Set timeout for entire auction process  
      timeoutId = setTimeout(() => {
        elizaLogger.info(`[ParlayTrading] Auction timeout after 5 minutes for auction ${auctionId}. No bids received.`);
        console.log(`⏰ Parlay auction timeout: No takers found for our ${markets.length}-leg parlay after 5 minutes. This may be normal if no automated takers are running.`);
        resolveOnce({ success: false, error: "No bids received within timeout" });
      }, 300000); // 5 minute timeout

      // Send keepalive pings every 20 seconds
      const startKeepAlive = () => {
        keepAliveInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            // Send ping message (WebSocket ping frame not available in browser)
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 20000);
      };

      socket.onopen = async () => {
        elizaLogger.info("[ParlayTrading] Connected to auction WebSocket as MAKER");
        startKeepAlive();

        // Get the correct maker nonce from the contract (must be sequential)
        const contractNonce = await getCurrentMakerNonce(walletAddress as `0x${string}`, rpcUrl);
        elizaLogger.info(`[ParlayTrading] Using contract maker nonce: ${contractNonce}`);

        // Use UMA resolver address from Arbitrum (chain 42161) 
        const UMA_RESOLVER_ADDRESS = "0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9";
        
        // Properly encode predicted outcomes like frontend does
        // Convert parlay markets to the format expected by UMA resolver
        const predictedOutcomes = await encodeParlayOutcomes(markets, predictions);

        // Start auction with parlay data
        const auctionMessage = {
          type: "auction.start",
          payload: {
            maker: walletAddress,
            wager: wagerAmount,
            resolver: UMA_RESOLVER_ADDRESS,
            predictedOutcomes,
            makerNonce: contractNonce,
          },
        };

        elizaLogger.info(`[ParlayTrading] Starting parlay auction: ${JSON.stringify(auctionMessage)}`);
        socket.send(JSON.stringify(auctionMessage));
      };

      socket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          elizaLogger.info(`[ParlayTrading] Received message type: ${message.type}`);
          
          // Log full message for debugging (truncated for bids)
          if (message.type === "auction.bids") {
            elizaLogger.info(`[ParlayTrading] Bid message payload keys: ${Object.keys(message.payload || {})}`);
          } else {
            elizaLogger.info(`[ParlayTrading] Full message: ${JSON.stringify(message)}`);
          }

          if (message.type === "auction.ack") {
            auctionId = message.payload?.auctionId;
            elizaLogger.info(`[ParlayTrading] Auction acknowledged with ID: ${auctionId}`);
            
            if (auctionId) {
              // Subscribe to receive bids for this auction
              socket.send(JSON.stringify({
                type: "auction.subscribe",
                payload: { auctionId }
              }));
              elizaLogger.info(`[ParlayTrading] Subscribed to auction bids for ${auctionId}`);
              console.log(`🎯 Parlay auction live! Waiting for takers to bid on our ${markets.length}-leg parlay (Auction ID: ${auctionId})`);
              
              // Set up periodic status updates
              const statusInterval = setInterval(() => {
                elizaLogger.info(`[ParlayTrading] Still waiting for bids on auction ${auctionId}...`);
              }, 30000); // Every 30 seconds
              
              // Clean up status interval when we're done
              const originalResolve = resolveOnce;
              const enhancedResolve = (result: { success: boolean; txHash?: string; error?: string }) => {
                clearInterval(statusInterval);
                originalResolve(result);
              };
              // Replace resolveOnce function with enhanced version
              resolveOnce = enhancedResolve;
            }
          } else if (message.type === "auction.bids") {
            const allBids = message.payload?.bids || [];
            
            elizaLogger.info(`[ParlayTrading] Received ${allBids.length} total bids`);
            
            // Filter bids for our specific auction (like frontend does)
            const ourBids = allBids.filter((bid: any) => bid?.auctionId === auctionId);
            elizaLogger.info(`[ParlayTrading] Found ${ourBids.length} bids for our auction ${auctionId}`);

            // Only process bids for our auction
            if (ourBids.length > 0) {
              // Select best bid (highest taker wager)
              const bestBid = selectBestBid(ourBids);
              elizaLogger.info(`[ParlayTrading] Selected best bid: ${JSON.stringify(bestBid)}`);

              // Accept the bid by executing mint transaction
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
            }
          } else if (message.type === "auction.error") {
            elizaLogger.error("[ParlayTrading] Auction error:", message.payload);
            resolveOnce({ success: false, error: message.payload?.message || "Auction error" });
          } else {
            // Log any other message types we might be missing
            elizaLogger.info(`[ParlayTrading] Unhandled message type: ${message.type}`);
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

function selectBestBid(bids: any[]): any {
  // Filter bids by current timestamp
  const now = Date.now() / 1000;
  const validBids = bids.filter((bid) => bid.takerDeadline > now);
  
  if (validBids.length === 0) {
    throw new Error("No valid bids available");
  }

  // Sort bids by taker wager amount (highest first)
  const sortedBids = validBids.sort((a, b) => {
    const wagerA = parseFloat(a.takerWager || '0');
    const wagerB = parseFloat(b.takerWager || '0');
    return wagerB - wagerA; // Highest wager first
  });

  return sortedBids[0];
}

async function acceptBid({
  bid,
  privateKey,
  rpcUrl,
}: {
  bid: any;
  privateKey: string;
  rpcUrl: string;
}): Promise<string> {
  try {
    const { submitTransaction } = await loadSdk();

    // Build mint transaction data using the bid details
    const mintCalldata = await buildMintCalldata({
      bid,
      maker: privateKeyToAddress(privateKey as `0x${string}`),
    });

    // Use the PredictionMarket contract address from Arbitrum (chain 42161)
    const PREDICTION_MARKET_ADDRESS = "0xb04841cad1147675505816e2ec5c915430857b40";
    
    // Get the correct maker nonce from the contract
    const makerAddress = privateKeyToAddress(privateKey as `0x${string}`);
    const currentMakerNonce = await getCurrentMakerNonce(makerAddress, rpcUrl);
    elizaLogger.info(`[ParlayTrading] Contract maker nonce: ${currentMakerNonce}, Bid maker nonce: ${bid.makerNonce}`);
    
    // Ensure ERC-20 approval for maker collateral (USDe tokens)
    await ensureTokenApproval({
      privateKey: privateKey as `0x${string}`,
      rpcUrl,
      amount: bid.makerCollateral || bid.wager || '0', // Maker collateral amount
    });

    elizaLogger.info("[ParlayTrading] Executing parlay mint transaction...");
    
    // Log the mint request details for debugging
    elizaLogger.info(`[ParlayTrading] Mint details - Maker: ${bid.maker}, Taker: ${bid.taker}`);
    elizaLogger.info(`[ParlayTrading] Collateral - Maker: ${bid.makerCollateral}, Taker: ${bid.takerWager}`);
    elizaLogger.info(`[ParlayTrading] Deadline: ${bid.takerDeadline}, Current time: ${Math.floor(Date.now() / 1000)}`);
    elizaLogger.info(`[ParlayTrading] Maker nonce: ${bid.makerNonce}`);
    
    const mintTx = await submitTransaction({
      rpc: rpcUrl,
      privateKey: privateKey as `0x${string}`,
      tx: {
        to: PREDICTION_MARKET_ADDRESS,
        data: mintCalldata,
        value: "0",
      },
    });

    elizaLogger.info(`[ParlayTrading] Parlay TX: ${mintTx.hash}`);
    return mintTx.hash;
  } catch (error: any) {
    elizaLogger.error("[ParlayTrading] Failed to accept bid:", error);
    throw error;
  }
}

async function buildMintCalldata({
  bid,
  maker,
}: {
  bid: any;
  maker: string;
}): Promise<`0x${string}`> {
  const { encodeFunctionData } = await import("viem");
  
  // Build mint request matching the exact PredictionMarket contract interface
  const mintRequest = {
    encodedPredictedOutcomes: bid.encodedPredictedOutcomes || "0x",
    resolver: bid.resolver || "0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9",
    makerCollateral: BigInt(bid.makerCollateral || bid.wager || '0'),
    takerCollateral: BigInt(bid.takerWager || '0'),
    maker: bid.maker || maker,
    taker: bid.taker,
    makerNonce: BigInt(bid.makerNonce || 0),
    takerSignature: bid.takerSignature || "0x",
    takerDeadline: BigInt(bid.takerDeadline || 0),
    refCode: "0x0000000000000000000000000000000000000000000000000000000000000000" // Empty refCode
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

async function getCurrentMakerNonce(walletAddress: string, rpcUrl: string): Promise<number> {
  try {
    const { createPublicClient, http } = await import("viem");
    const { arbitrum } = await import("viem/chains");

    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    // Read the current nonce from the PredictionMarket contract
    const PREDICTION_MARKET_ADDRESS = "0xb04841cad1147675505816e2ec5c915430857b40";
    
    const nonce = await publicClient.readContract({
      address: PREDICTION_MARKET_ADDRESS,
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
    elizaLogger.error("[ParlayTrading] Failed to get maker nonce:", error);
    return 0;
  }
}

async function ensureTokenApproval({
  privateKey,
  rpcUrl,
  amount,
}: {
  privateKey: `0x${string}`;
  rpcUrl: string;
  amount: string;
}): Promise<void> {
  try {
    const { createWalletClient, createPublicClient, http, erc20Abi } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { arbitrum } = await import("viem/chains");

    // Contract addresses for Arbitrum
    const USDE_TOKEN_ADDRESS = "0xfeb8c4d5efbaff6e928ea090bc660c363f883dba"; // USDe collateral token
    const PREDICTION_MARKET_ADDRESS = "0xb04841cad1147675505816e2ec5c915430857b40";

    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    // Check current allowance
    const allowance = await publicClient.readContract({
      address: USDE_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, PREDICTION_MARKET_ADDRESS],
    }) as bigint;

    const requiredAmount = BigInt(amount);
    elizaLogger.info(`[ParlayTrading] Current allowance: ${allowance}, required: ${requiredAmount}`);

    if (allowance >= requiredAmount) {
      elizaLogger.info("[ParlayTrading] Sufficient allowance already exists");
      return;
    }

    // Need to approve the contract
    elizaLogger.info("[ParlayTrading] Approving USDe tokens for PredictionMarket contract...");
    
    const walletClient = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    // Approve a large amount to avoid future approvals
    const approvalAmount = BigInt("1000000000000000000000000"); // 1M USDe

    const hash = await walletClient.writeContract({
      address: USDE_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PREDICTION_MARKET_ADDRESS, approvalAmount],
    });

    elizaLogger.info(`[ParlayTrading] Approval transaction submitted: ${hash}`);
    
    // Wait for approval transaction to be mined
    await publicClient.waitForTransactionReceipt({ hash });
    elizaLogger.info("[ParlayTrading] Approval confirmed");
  } catch (error) {
    elizaLogger.error("[ParlayTrading] Failed to ensure token approval:", error);
    throw error;
  }
}

async function encodeParlayOutcomes(markets: any[], predictions: any[]): Promise<string[]> {
  try {
    // Convert markets and predictions to the format expected by UMA resolver
    const outcomes = markets.map((market, index) => {
      const prediction = predictions[index];
      return {
        marketId: market.id, // Use the market ID from conditions endpoint
        prediction: prediction.probability > 50, // Convert probability to boolean
      };
    });

    // Normalize marketId to ensure proper bytes32 format
    const normalized = outcomes.map((o) => ({
      marketId: (o.marketId.startsWith('0x')
        ? o.marketId
        : `0x${o.marketId}`) as `0x${string}`,
      prediction: !!o.prediction,
    }));

    // Encode as per UMA resolver expectations
    const encoded = encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [
            { name: 'marketId', type: 'bytes32' },
            { name: 'prediction', type: 'bool' },
          ],
        },
      ],
      [normalized]
    );

    elizaLogger.info(`[ParlayTrading] Encoded ${outcomes.length} predicted outcomes`);
    return [encoded];
  } catch (error) {
    elizaLogger.error("[ParlayTrading] Failed to encode predicted outcomes:", error);
    // Fallback to simple encoding
    return predictions.map(p => `0x${p.probability > 50 ? '01' : '00'}`);
  }
}


export default parlayTradingAction;