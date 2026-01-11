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
  getTradingRpcUrl,
  getTradingConfig, 
  getApiEndpoints, 
  getTradingContractAddresses,
  CHAIN_ID_ETHEREAL,
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
import { privateKeyToAccount } from "viem/accounts";

interface AuctionStartedPayload {
  taker: string;
  wager: string;
  resolver: string;
  predictedOutcomes: string[];
  takerNonce: number;
  chainId: number;
  auctionId: string;
}

/**
 * Handle auction.started events from other users (Market Maker mode)
 */
async function handleOthersAuction(
  auction: AuctionStartedPayload,
  socket: WebSocket
): Promise<void> {
  try {
    elizaLogger.info(`[MarketMaker] 🔔 Received auction.started event!`);
    elizaLogger.info(`[MarketMaker] Taker: ${auction.taker}, Wager: ${auction.wager}`);
    
    // Skip if Market Maker is disabled
    if (process.env.MARKET_MAKER_ENABLED !== "true") {
      elizaLogger.info(`[MarketMaker] Skipping: Market Maker disabled`);
      return;
    }

    // Skip if it's our own auction
    const ourAddress = getWalletAddress().toLowerCase();
    if (auction.taker.toLowerCase() === ourAddress) {
      elizaLogger.info(`[MarketMaker] Skipping: Our own auction`);
      return;
    }

    // Skip if wrong chain
    if (auction.chainId !== CHAIN_ID_ETHEREAL) {
      elizaLogger.info(`[MarketMaker] Skipping: wrong chain (${auction.chainId})`);
      return;
    }

    // Check wager limit
    const takerWager = BigInt(auction.wager);
    const maxWager = BigInt(process.env.MARKET_MAKER_MAX_WAGER || "500000000000000000");

    if (takerWager > maxWager) {
      elizaLogger.info(`[MarketMaker] Skipping: Taker wager too high (${formatWagerAmount(auction.wager)} > ${formatWagerAmount(maxWager.toString())} USDe)`);
      return;
    }

    elizaLogger.info(`[MarketMaker] 💰 NEW OPPORTUNITY from ${auction.taker.slice(0, 10)}...`);
    elizaLogger.info(`[MarketMaker] Wager: ${formatWagerAmount(auction.wager)} USDe`);
    elizaLogger.info(`[MarketMaker] Auction ID: ${auction.auctionId}`);

    // Calculate our bid (taker's wager + edge)
    const minEdge = parseFloat(process.env.MARKET_MAKER_MIN_EDGE || "0.05");
    const auctionTakerWager = BigInt(auction.wager);
    const makerWager = auctionTakerWager + BigInt(Math.floor(Number(auctionTakerWager) * minEdge));

    elizaLogger.info(`[MarketMaker] Our bid: ${formatWagerAmount(makerWager.toString())} USDe (${(minEdge * 100).toFixed(1)}% edge)`);

    // Get our nonce
    const walletAddress = getWalletAddress();
    const makerNonce = await getCurrentMakerNonce(walletAddress);
    
    // Get contract addresses
    const { RESOLVER } = getTradingContractAddresses();

    // Prepare bid payload
    const bidPayload = {
      auctionId: auction.auctionId,
      maker: walletAddress,
      makerWager: makerWager.toString(),
      makerDeadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      makerNonce,
      taker: auction.taker,
      takerCollateral: auction.wager,
      resolver: auction.resolver || RESOLVER,
      encodedPredictedOutcomes: auction.predictedOutcomes[0] || "0x",
      predictedOutcomes: auction.predictedOutcomes,
      chainId: CHAIN_ID_ETHEREAL,
    };

    // Sign the bid
    const privateKey = getPrivateKey();
    if (!privateKey) {
      elizaLogger.error("[MarketMaker] No private key available");
      return;
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const sdk = await loadSdk();
    let makerSignature: string;

    if (sdk.createBidSiweMessage && sdk.extractSiweDomainAndUri) {
      const { sapienceWs } = getApiEndpoints();
      const { domain, uri } = sdk.extractSiweDomainAndUri(sapienceWs);
      const issuedAt = new Date().toISOString();
      const message = sdk.createBidSiweMessage(bidPayload, domain, uri, issuedAt);
      makerSignature = await account.signMessage({ message });
      elizaLogger.info("[MarketMaker] Bid signed with SIWE");
    } else {
      const message = `Bid for auction ${auction.auctionId}`;
      makerSignature = await account.signMessage({ message });
      elizaLogger.warn("[MarketMaker] Using fallback signature (no SDK)");
    }

    // Send bid via WebSocket
    const bidMessage = {
      type: "auction.bid",
      payload: {
        ...bidPayload,
        makerSignature,
      },
    };

    socket.send(JSON.stringify(bidMessage));
    elizaLogger.info(`[MarketMaker] ✅ BID SUBMITTED! Auction: ${auction.auctionId}`);
    elizaLogger.info(`[MarketMaker] Our wager: ${formatWagerAmount(makerWager.toString())} vs Taker: ${formatWagerAmount(auction.wager)}`);
  } catch (error: any) {
    elizaLogger.error("[MarketMaker] Error:", error?.message || error);
  }
}

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
  description: "Start trading auction with 2 legs from different categories and accept best bid from takers",
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

      // Validate we have at least 2 legs for trade (from different categories)
      if (!markets || !predictions || markets.length < 2 || predictions.length < 2) {
        await callback?.({
          text: "Trading requires at least 2 market predictions from different categories",
          content: {},
        });
        return;
      }

      // Get wallet details - trading uses Ethereal chain
      const privateKey = getPrivateKey();
      const walletAddress = getWalletAddress();
      const rpcUrl = getTradingRpcUrl();
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

        // Trading uses Ethereal chain with lzPMResolver
        const { RESOLVER } = getTradingContractAddresses();
        const predictedOutcomes = await encodeTradeOutcomes(markets, predictions);

        // Prepare base auction payload
        const payload = {
          taker: walletAddress,
          wager: wagerAmount,
          resolver: RESOLVER,
          predictedOutcomes,
          takerNonce: contractNonce,
          chainId: CHAIN_ID_ETHEREAL,
        };

        // Optional: Sign the auction request to get actionable bids
        // Unsigned requests return quote-only bids (for price discovery)
        // Signed requests are required by some market makers (like the vault) to respond with actionable bids
        let takerSignature: string | undefined;
        let takerSignedAt: string | undefined;
        
        try {
          const privateKey = getPrivateKey();
          if (privateKey) {
            const account = privateKeyToAccount(privateKey as `0x${string}`);
            const sdk = await loadSdk();
            if (sdk.createAuctionStartSiweMessage && sdk.extractSiweDomainAndUri) {
              const { domain, uri } = sdk.extractSiweDomainAndUri(sapienceWs);
              const issuedAt = new Date().toISOString();
              const message = sdk.createAuctionStartSiweMessage(payload, domain, uri, issuedAt);
              takerSignature = await account.signMessage({ message });
              takerSignedAt = issuedAt;
              elizaLogger.info(`[Trading] Auction request signed for actionable bids`);
            } else {
              elizaLogger.warn(`[Trading] SDK functions not available, proceeding without signature`);
            }
          }
        } catch (err) {
          elizaLogger.warn(`[Trading] Failed to sign auction request, proceeding without signature:`, err);
        }

        const auctionMessage = {
          type: "auction.start",
          payload: {
            ...payload,
            ...(takerSignature && takerSignedAt ? { takerSignature, takerSignedAt } : {}),
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
                requesterWager: wagerAmount,
              });

              resolveOnce({ success: true, txHash });
            }
          } else if (message.type === "auction.error") {
            elizaLogger.error("[Trading] Auction error:", message.payload);
            resolveOnce({ success: false, error: message.payload?.message || "Auction error" });
          } else if (message.type === "auction.started") {
            // Handle other people's auctions (Market Maker mode)
            handleOthersAuction(message.payload, socket).catch((error) => {
              elizaLogger.error("[Trading] Error handling others' auction:", error);
            });
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
  requesterWager,
}: {
  bid: Bid;
  privateKey: string;
  rpcUrl: string;
  requesterWager: string;
}): Promise<string> {
  try {
    const { submitTransaction } = await loadSdk();

    const { getWalletAddress } = await import("../utils/blockchain.js");
    const requesterAddress = getWalletAddress(); // Requester = auction creator (agent)
    
    // Trading uses Ethereal chain
    const { PREDICTION_MARKET } = getTradingContractAddresses();
    
    // Get the requester's nonce from the contract (required for mint)
    const requesterNonce = BigInt(await getCurrentMakerNonce(requesterAddress, rpcUrl));
    elizaLogger.info(`[Trading] Requester nonce: ${requesterNonce}, Responder (bidder): ${bid.maker}`);
    
    const mintCalldata = await buildMintCalldata({
      bid,
      requester: requesterAddress,
      requesterNonce,
      requesterWager,
    });
    
    await ensureTokenApproval({
      privateKey: privateKey as `0x${string}`,
      rpcUrl,
      amount: requesterWager, // Use our original wager, not bid value
    });

    elizaLogger.info("[Trading] Executing trade mint transaction on Ethereal...");
    elizaLogger.info(`[Trading] Requester (auction creator): ${requesterAddress}`);
    elizaLogger.info(`[Trading] Responder (bidder): ${bid.maker}`);
    elizaLogger.info(`[Trading] Collateral - Requester: ${requesterWager}, Responder: ${bid.makerWager}`);
    elizaLogger.info(`[Trading] Requester nonce: ${requesterNonce}`);
    
    const mintTx = await submitTransaction({
      rpc: rpcUrl,
      chainId: CHAIN_ID_ETHEREAL,
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

