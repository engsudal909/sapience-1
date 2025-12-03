import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
import { 
  getPrivateKey, 
  getWalletAddress, 
  getRpcUrl, 
  getTradingConfig, 
  getApiEndpoints, 
  getContractAddresses 
} from "../utils/blockchain.js";
import { 
  getCurrentMakerNonce, 
  ensureTokenApproval, 
  buildMintCalldata 
} from "../utils/contracts.js";
import { 
  encodeTradeOutcomes, 
  selectBestBid, 
  formatWagerAmount 
} from "../utils/trading.js";

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

export const tradingAction: Action = {
  name: "TRADING",
  description: "Start trading auction with 3+ legs and accept best bid from takers",
  similes: ["trade markets", "make trade", "start auction", "bet trade"],

  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      // Check if trading is enabled via environment variable or AUTONOMOUS_MODE
      const tradingEnabled = 
        process.env.ENABLE_TRADING === "true" || 
        (process.env.AUTONOMOUS_MODE || "").toLowerCase().includes("trade");
      if (!tradingEnabled) {
        elizaLogger.info("[Trading] Trading disabled via ENABLE_TRADING env var");
        await callback?.({
          text: "Trading is disabled. Set ENABLE_TRADING=true or AUTONOMOUS_MODE=trade to enable.",
          content: {},
        });
        return;
      }

      // Parse trade data from message - expect multiple market predictions
      const text = message.content?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        await callback?.({
          text: 'Provide trade data: {"markets": [...], "predictions": [...]}',
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

      // Validate we have at least 3 legs for trade
      if (!markets || !predictions || markets.length < 3 || predictions.length < 3) {
        await callback?.({
          text: "Trading requires at least 3 market predictions",
          content: {},
        });
        return;
      }

      // Get wallet details
      const privateKey = getPrivateKey();
      const walletAddress = getWalletAddress();
      const rpcUrl = getRpcUrl();
      const { wagerAmount } = getTradingConfig();

      elizaLogger.info(`[Trading] Starting trading auction with ${markets.length} legs`);

      // Start auction as maker
      const auctionResult = await startTradingAuction({
        markets,
        predictions,
        walletAddress,
        wagerAmount,
        rpcUrl,
      });

      if (auctionResult.success) {
        elizaLogger.info(
          `[Trading] Trade executed successfully: ${auctionResult.txHash}`,
        );
        await callback?.({
          text: `Trade executed: ${markets.length} legs, wager ${formatWagerAmount(wagerAmount)} (TX: ${auctionResult.txHash})`,
          content: {
            success: true,
            legs: markets.length,
            predictions: predictions.map(p => ({ market: p.market, probability: p.probability })),
            txHash: auctionResult.txHash,
          },
        });
      } else {
        throw new Error(auctionResult.error || "Trading auction failed");
      }
    } catch (err: any) {
      elizaLogger.error("[Trading] Trading failed:", err);
      await callback?.({
        text: `Trading failed: ${err?.message}`,
        content: { success: false, error: err?.message },
      });
    }
  },
};

async function startTradingAuction({
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
      const { sapienceWs } = getApiEndpoints();
      const socket = new WebSocket(sapienceWs);

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

      const { auctionTimeoutMs, keepAliveMs } = getTradingConfig();
      timeoutId = setTimeout(() => {
        elizaLogger.info(`[Trading] Auction timeout after ${auctionTimeoutMs/1000}s for auction ${auctionId}. No bids received.`);
        console.log(`⏰ Trading auction timeout: No takers found for our ${markets.length}-leg trade after ${auctionTimeoutMs/1000}s.`);
        resolveOnce({ success: false, error: "No bids received within timeout" });
      }, auctionTimeoutMs);

      const startKeepAlive = () => {
        keepAliveInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, keepAliveMs);
      };

      socket.onopen = async () => {
        elizaLogger.info("[Trading] Connected to auction WebSocket as TAKER");
        startKeepAlive();

        const contractNonce = await getCurrentMakerNonce(walletAddress as `0x${string}`, rpcUrl);
        elizaLogger.info(`[Trading] Using contract taker nonce: ${contractNonce}`);

        const { UMA_RESOLVER } = getContractAddresses();
        const predictedOutcomes = await encodeTradeOutcomes(markets, predictions);

        const chainId = parseInt(process.env.CHAIN_ID || "42161");

        const auctionMessage = {
          type: "auction.start",
          payload: {
            taker: walletAddress,
            wager: wagerAmount,
            resolver: UMA_RESOLVER,
            predictedOutcomes,
            takerNonce: contractNonce,
            chainId: chainId,
          },
        };

        elizaLogger.info(`[Trading] Starting trading auction: ${JSON.stringify(auctionMessage)}`);
        socket.send(JSON.stringify(auctionMessage));
      };

      socket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          elizaLogger.info(`[Trading] Received message type: ${message.type}`);
          
          if (message.type === "auction.bids") {
            elizaLogger.info(`[Trading] Bid message payload keys: ${Object.keys(message.payload || {})}`);
          } else {
            elizaLogger.info(`[Trading] Full message: ${JSON.stringify(message)}`);
          }

          if (message.type === "auction.ack") {
            auctionId = message.payload?.auctionId;
            elizaLogger.info(`[Trading] Auction acknowledged with ID: ${auctionId}`);
            
            if (auctionId) {
              socket.send(JSON.stringify({
                type: "auction.subscribe",
                payload: { auctionId }
              }));
              elizaLogger.info(`[Trading] Subscribed to auction bids for ${auctionId}`);
              console.log(`🎯 Trading auction live! Waiting for takers to bid on our ${markets.length}-leg trade (Auction ID: ${auctionId})`);
              
              const { statusIntervalMs } = getTradingConfig();
              const statusInterval = setInterval(() => {
                elizaLogger.info(`[Trading] Still waiting for bids on auction ${auctionId}...`);
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
            elizaLogger.info(`[Trading] Received ${allBids.length} total bids`);
            
            const ourBids = allBids.filter((bid: Bid) => bid?.auctionId === auctionId);
            elizaLogger.info(`[Trading] Found ${ourBids.length} bids for our auction ${auctionId}`);

            if (ourBids.length > 0) {
              const bestBid = selectBestBid(ourBids);
              elizaLogger.info(`[Trading] Selected best bid: ${JSON.stringify(bestBid)}`);

              const privateKey = getPrivateKey();
              
              const txHash = await acceptBid({
                bid: bestBid,
                privateKey,
                rpcUrl,
              });

              resolveOnce({ success: true, txHash });
            }
          } else if (message.type === "auction.error") {
            elizaLogger.error("[Trading] Auction error:", message.payload);
            resolveOnce({ success: false, error: message.payload?.message || "Auction error" });
          } else {
            elizaLogger.info(`[Trading] Unhandled message type: ${message.type}`);
          }
        } catch (error: any) {
          elizaLogger.error("[Trading] Error processing message:", error);
          resolveOnce({ success: false, error: error.message });
        }
      };

      socket.onerror = (error: any) => {
        elizaLogger.error("[Trading] WebSocket error:", error);
        resolveOnce({ success: false, error: "WebSocket error" });
      };

      socket.onclose = (event) => {
        elizaLogger.info(`[Trading] WebSocket closed: ${event.code} ${event.reason}`);
        if (!resolved) {
          if (event.code === 1006) {
            elizaLogger.warn("[Trading] Connection closed abnormally - server may not be available");
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

    const { getWalletAddress } = await import("../utils/blockchain.js");
    const makerAddress = getWalletAddress();
    
    const mintCalldata = await buildMintCalldata({
      bid,
      maker: makerAddress,
    });

    const { PREDICTION_MARKET } = getContractAddresses();
    
    const currentMakerNonce = await getCurrentMakerNonce(makerAddress, rpcUrl);
    elizaLogger.info(`[Trading] Contract maker nonce: ${currentMakerNonce}, Bid maker nonce: ${bid.makerNonce}`);
    
    await ensureTokenApproval({
      privateKey: privateKey as `0x${string}`,
      rpcUrl,
      amount: bid.takerCollateral || bid.wager || '0',
    });

    elizaLogger.info("[Trading] Executing trade mint transaction...");
    elizaLogger.info(`[Trading] Mint details - Maker: ${bid.maker}, Taker: ${bid.taker}`);
    elizaLogger.info(`[Trading] Collateral - Maker: ${bid.makerWager}, Taker: ${bid.takerCollateral}`);
    elizaLogger.info(`[Trading] Maker nonce: ${bid.makerNonce}`);
    
    const mintTx = await submitTransaction({
      rpc: rpcUrl,
      privateKey: privateKey as `0x${string}`,
      tx: {
        to: PREDICTION_MARKET,
        data: mintCalldata,
        value: "0",
      },
    });

    elizaLogger.info(`[Trading] Trade TX: ${mintTx.hash}`);
    return mintTx.hash;
  } catch (error: any) {
    elizaLogger.error("[Trading] Failed to accept bid:", error);
    throw error;
  }
}





export default tradingAction;

