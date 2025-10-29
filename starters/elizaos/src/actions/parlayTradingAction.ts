import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
import { privateKeyToAddress } from "viem/accounts";
import { encodeAbiParameters } from "viem";

const SAPIENCE_WS_URL = process.env.SAPIENCE_WS_URL || "wss://api.sapience.xyz/auction";

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
      const wagerAmount = process.env.PARLAY_WAGER_AMOUNT || "1000000000000000000";

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
          text: `Parlay executed: ${markets.length} legs, wager ${parseFloat(wagerAmount) / 1e18} USDe (TX: ${auctionResult.txHash})`,
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

      const timeoutMs = parseInt(process.env.PARLAY_AUCTION_TIMEOUT_MS || "300000");
      timeoutId = setTimeout(() => {
        elizaLogger.info(`[ParlayTrading] Auction timeout after ${timeoutMs/1000}s for auction ${auctionId}. No bids received.`);
        console.log(`⏰ Parlay auction timeout: No takers found for our ${markets.length}-leg parlay after ${timeoutMs/1000}s.`);
        resolveOnce({ success: false, error: "No bids received within timeout" });
      }, timeoutMs);

      const startKeepAlive = () => {
        const keepAliveMs = parseInt(process.env.PARLAY_KEEPALIVE_INTERVAL_MS || "20000");
        keepAliveInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, keepAliveMs);
      };

      socket.onopen = async () => {
        elizaLogger.info("[ParlayTrading] Connected to auction WebSocket as MAKER");
        startKeepAlive();

        const contractNonce = await getCurrentMakerNonce(walletAddress as `0x${string}`, rpcUrl);
        elizaLogger.info(`[ParlayTrading] Using contract maker nonce: ${contractNonce}`);

        const UMA_RESOLVER_ADDRESS = process.env.UMA_RESOLVER_ADDRESS || "0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9";
        const predictedOutcomes = await encodeParlayOutcomes(markets, predictions);

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
          
          if (message.type === "auction.bids") {
            elizaLogger.info(`[ParlayTrading] Bid message payload keys: ${Object.keys(message.payload || {})}`);
          } else {
            elizaLogger.info(`[ParlayTrading] Full message: ${JSON.stringify(message)}`);
          }

          if (message.type === "auction.ack") {
            auctionId = message.payload?.auctionId;
            elizaLogger.info(`[ParlayTrading] Auction acknowledged with ID: ${auctionId}`);
            
            if (auctionId) {
              socket.send(JSON.stringify({
                type: "auction.subscribe",
                payload: { auctionId }
              }));
              elizaLogger.info(`[ParlayTrading] Subscribed to auction bids for ${auctionId}`);
              console.log(`🎯 Parlay auction live! Waiting for takers to bid on our ${markets.length}-leg parlay (Auction ID: ${auctionId})`);
              
              const statusIntervalMs = parseInt(process.env.PARLAY_STATUS_INTERVAL_MS || "30000");
              const statusInterval = setInterval(() => {
                elizaLogger.info(`[ParlayTrading] Still waiting for bids on auction ${auctionId}...`);
              }, statusIntervalMs);
              
              const originalResolve = resolveOnce;
              const enhancedResolve = (result: { success: boolean; txHash?: string; error?: string }) => {
                clearInterval(statusInterval);
                originalResolve(result);
              };
              resolveOnce = enhancedResolve;
            }
          } else if (message.type === "auction.bids") {
            const allBids = message.payload?.bids || [];
            elizaLogger.info(`[ParlayTrading] Received ${allBids.length} total bids`);
            
            const ourBids = allBids.filter((bid: any) => bid?.auctionId === auctionId);
            elizaLogger.info(`[ParlayTrading] Found ${ourBids.length} bids for our auction ${auctionId}`);

            if (ourBids.length > 0) {
              const bestBid = selectBestBid(ourBids);
              elizaLogger.info(`[ParlayTrading] Selected best bid: ${JSON.stringify(bestBid)}`);

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
  const now = Date.now() / 1000;
  const validBids = bids.filter((bid) => bid.takerDeadline > now);
  
  if (validBids.length === 0) {
    throw new Error("No valid bids available");
  }

  const sortedBids = validBids.sort((a, b) => {
    const wagerA = parseFloat(a.takerWager || '0');
    const wagerB = parseFloat(b.takerWager || '0');
    return wagerB - wagerA;
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

    const mintCalldata = await buildMintCalldata({
      bid,
      maker: privateKeyToAddress(privateKey as `0x${string}`),
    });

    const PREDICTION_MARKET_ADDRESS = (process.env.PREDICTION_MARKET_ADDRESS || "0xb04841cad1147675505816e2ec5c915430857b40") as `0x${string}`;
    
    const makerAddress = privateKeyToAddress(privateKey as `0x${string}`);
    const currentMakerNonce = await getCurrentMakerNonce(makerAddress, rpcUrl);
    elizaLogger.info(`[ParlayTrading] Contract maker nonce: ${currentMakerNonce}, Bid maker nonce: ${bid.makerNonce}`);
    
    await ensureTokenApproval({
      privateKey: privateKey as `0x${string}`,
      rpcUrl,
      amount: bid.makerCollateral || bid.wager || '0',
    });

    elizaLogger.info("[ParlayTrading] Executing parlay mint transaction...");
    elizaLogger.info(`[ParlayTrading] Mint details - Maker: ${bid.maker}, Taker: ${bid.taker}`);
    elizaLogger.info(`[ParlayTrading] Collateral - Maker: ${bid.makerCollateral}, Taker: ${bid.takerWager}`);
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

async function getCurrentMakerNonce(walletAddress: string, rpcUrl: string): Promise<number> {
  try {
    const { createPublicClient, http } = await import("viem");
    const { arbitrum } = await import("viem/chains");

    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    const PREDICTION_MARKET_ADDRESS = (process.env.PREDICTION_MARKET_ADDRESS || "0xb04841cad1147675505816e2ec5c915430857b40") as `0x${string}`;
    
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

    const USDE_TOKEN_ADDRESS = (process.env.USDE_TOKEN_ADDRESS || "0xfeb8c4d5efbaff6e928ea090bc660c363f883dba") as `0x${string}`;
    const PREDICTION_MARKET_ADDRESS = (process.env.PREDICTION_MARKET_ADDRESS || "0xb04841cad1147675505816e2ec5c915430857b40") as `0x${string}`;

    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl)
    });

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

    elizaLogger.info("[ParlayTrading] Approving USDe tokens for PredictionMarket contract...");
    
    const walletClient = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    const approvalAmount = BigInt(process.env.USDE_APPROVAL_AMOUNT || "1000000000000000000000000");

    const hash = await walletClient.writeContract({
      address: USDE_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PREDICTION_MARKET_ADDRESS, approvalAmount],
    });

    elizaLogger.info(`[ParlayTrading] Approval transaction submitted: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    elizaLogger.info("[ParlayTrading] Approval confirmed");
  } catch (error) {
    elizaLogger.error("[ParlayTrading] Failed to ensure token approval:", error);
    throw error;
  }
}

async function encodeParlayOutcomes(markets: any[], predictions: any[]): Promise<string[]> {
  try {
    const outcomes = markets.map((market, index) => {
      const prediction = predictions[index];
      return {
        marketId: market.id,
        prediction: prediction.probability > 50,
      };
    });

    const normalized = outcomes.map((o) => ({
      marketId: (o.marketId.startsWith('0x')
        ? o.marketId
        : `0x${o.marketId}`) as `0x${string}`,
      prediction: !!o.prediction,
    }));

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
    return predictions.map(p => `0x${p.probability > 50 ? '01' : '00'}`);
  }
}

export default parlayTradingAction;