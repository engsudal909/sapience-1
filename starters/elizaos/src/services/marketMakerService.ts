import { elizaLogger, IAgentRuntime } from "@elizaos/core";
import { getWalletAddress, getPrivateKey, getApiEndpoints, CHAIN_ID_ETHEREAL, getTradingContractAddresses } from "../utils/blockchain.js";
import { formatWagerAmount } from "../utils/trading.js";
import { parseEther } from "viem";

interface AuctionStartedEvent {
  taker: string;
  wager: string;
  resolver: string;
  predictedOutcomes: string[];
  takerNonce: number;
  chainId: number;
  auctionId: string;
}

/**
 * Market Maker Service - Provides liquidity by bidding on auctions
 * Based on official Sapience Market Maker starter
 */
export class MarketMakerService {
  private runtime: IAgentRuntime;
  private ws: any = null;
  private isEnabled: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.isEnabled = process.env.MARKET_MAKER_ENABLED === "true";
    
    if (this.isEnabled) {
      elizaLogger.info("[MarketMaker] 🤖 Market Maker mode enabled");
      // Start after a short delay
      setTimeout(() => {
        this.connect();
      }, 5000);
    }
  }

  private async connect() {
    try {
      elizaLogger.info("[MarketMaker] 🔌 Connecting to Auction Relayer...");
      
      const { sapienceWs } = getApiEndpoints();
      elizaLogger.info(`[MarketMaker] WebSocket URL: ${sapienceWs}`);
      
      // Dynamically import SDK to avoid TypeScript errors
      elizaLogger.info("[MarketMaker] Importing SDK...");
      const sdk: any = await import("@sapience/sdk");
      elizaLogger.info("[MarketMaker] SDK imported successfully");
      const createAuctionWs = sdk.createAuctionWs || sdk.default?.createAuctionWs;
      
      elizaLogger.info(`[MarketMaker] SDK keys: ${Object.keys(sdk).filter((k:string) => k.includes('Auction') || k.includes('create')).join(', ')}`);
      elizaLogger.info(`[MarketMaker] createAuctionWs type: ${typeof createAuctionWs}`);
      
      if (!createAuctionWs) {
        elizaLogger.error("[MarketMaker] ❌ SDK createAuctionWs not available");
        return;
      }
      
      // Use SDK's WebSocket helper with proper handlers
      this.ws = createAuctionWs(sapienceWs, {
        onOpen: () => {
          elizaLogger.info("[MarketMaker] ✅ Connected! Listening for auctions...");
        },
        onMessage: async (message: any) => {
          try {
            if (message.type === "auction.started") {
              await this.handleAuction(message.payload as AuctionStartedEvent);
            } else if (message.type === "bid.ack") {
              elizaLogger.info(`[MarketMaker] ✅ Bid acknowledged: ${JSON.stringify(message.payload)}`);
            } else if (message.type === "bid.error") {
              elizaLogger.error(`[MarketMaker] ❌ Bid error: ${JSON.stringify(message.payload)}`);
            }
          } catch (error: any) {
            elizaLogger.error("[MarketMaker] Error processing message:", error?.message);
          }
        },
        onError: (error: any) => {
          elizaLogger.error("[MarketMaker] WebSocket error:", error?.message || error);
        },
        onClose: (code: number, reason: Buffer) => {
          elizaLogger.warn(`[MarketMaker] ⚠️  WebSocket closed (${code}): ${reason.toString()}`);
          this.scheduleReconnect();
        },
      });

    } catch (error: any) {
      elizaLogger.error("[MarketMaker] Failed to connect:", error?.message);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 10000); // 10 seconds
  }

  private async handleAuction(auction: AuctionStartedEvent) {
    try {
      elizaLogger.info(`[MarketMaker] 🔔 New auction: ${auction.auctionId}`);
      elizaLogger.info(`[MarketMaker] Taker: ${auction.taker.slice(0, 10)}..., Wager: ${formatWagerAmount(auction.wager)} USDe`);

      // Filter: Skip our own auctions
      const ourAddress = getWalletAddress().toLowerCase();
      if (auction.taker.toLowerCase() === ourAddress) {
        elizaLogger.info(`[MarketMaker] ⏭️  Skipping: Our own auction`);
        return;
      }

      // Filter: Check chain
      if (auction.chainId !== CHAIN_ID_ETHEREAL) {
        elizaLogger.info(`[MarketMaker] ⏭️  Skipping: Wrong chain (${auction.chainId})`);
        return;
      }

      // Filter: Check wager size
      const takerWager = BigInt(auction.wager);
      const maxWager = BigInt(process.env.MARKET_MAKER_MAX_WAGER || "500000000000000000"); // 0.5 USDe
      
      if (takerWager > maxWager) {
        elizaLogger.info(`[MarketMaker] ⏭️  Skipping: Wager too high (${formatWagerAmount(auction.wager)} > ${formatWagerAmount(maxWager.toString())})`);
        return;
      }

      elizaLogger.info(`[MarketMaker] 💰 OPPORTUNITY FOUND!`);
      
      // Submit bid
      await this.submitBid(auction);

    } catch (error: any) {
      elizaLogger.error(`[MarketMaker] Error handling auction:`, error?.message);
    }
  }

  private async submitBid(auction: AuctionStartedEvent) {
    try {
      const privateKey = getPrivateKey();
      if (!privateKey) {
        elizaLogger.error("[MarketMaker] No private key available");
        return;
      }

      // Dynamically import SDK functions
      const sdk: any = await import("@sapience/sdk");
      const prepareForTrade = sdk.prepareForTrade || sdk.default?.prepareForTrade;
      const buildMakerBidTypedData = sdk.buildMakerBidTypedData || sdk.default?.buildMakerBidTypedData;
      const signMakerBid = sdk.signMakerBid || sdk.default?.signMakerBid;

      if (!prepareForTrade || !buildMakerBidTypedData || !signMakerBid) {
        elizaLogger.error("[MarketMaker] Required SDK functions not available");
        return;
      }

      // Calculate our bid (taker's wager + edge)
      const minEdge = parseFloat(process.env.MARKET_MAKER_MIN_EDGE || "0.05");
      const takerWager = BigInt(auction.wager);
      const makerWager = takerWager + BigInt(Math.floor(Number(takerWager) * minEdge));

      elizaLogger.info(`[MarketMaker] Our bid: ${formatWagerAmount(makerWager.toString())} USDe (${(minEdge * 100).toFixed(1)}% edge)`);

      // Prepare collateral (wrap USDe to WUSDe and approve)
      elizaLogger.info("[MarketMaker] 📦 Preparing collateral...");
      const { ready, wrapTxHash, approvalTxHash, wusdBalance } = await prepareForTrade({
        privateKey: privateKey as `0x${string}`,
        collateralAmount: makerWager,
      });

      if (!ready) {
        elizaLogger.error("[MarketMaker] Failed to prepare collateral");
        return;
      }

      if (wrapTxHash) {
        elizaLogger.info(`[MarketMaker] ✅ Wrapped USDe: ${wrapTxHash}`);
      }
      if (approvalTxHash) {
        elizaLogger.info(`[MarketMaker] ✅ Approved WUSDe: ${approvalTxHash}`);
      }

      elizaLogger.info(`[MarketMaker] WUSDe balance: ${formatWagerAmount(wusdBalance.toString())}`);

      // Get contract addresses
      const { PREDICTION_MARKET } = getTradingContractAddresses();
      const maker = getWalletAddress();

      // Build typed data for bid
      const { domain, types, primaryType, message } = buildMakerBidTypedData({
        auction: {
          taker: auction.taker,
          resolver: auction.resolver,
          predictedOutcomes: auction.predictedOutcomes,
          wager: auction.wager,
        },
        makerWager: makerWager.toString(),
        makerDeadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        chainId: CHAIN_ID_ETHEREAL,
        verifyingContract: PREDICTION_MARKET,
        maker,
        makerNonce: BigInt(auction.takerNonce ?? 0),
      });

      // Sign the bid
      const signature = await signMakerBid({
        privateKey: privateKey as `0x${string}`,
        domain,
        types,
        primaryType,
        message,
      });

      elizaLogger.info("[MarketMaker] ✍️  Bid signed");

      // Submit bid to relayer
      const bidPayload = {
        auctionId: auction.auctionId,
        maker,
        makerWager: makerWager.toString(),
        makerDeadline: message.makerDeadline,
        makerSignature: signature,
        makerNonce: message.makerNonce.toString(),
      };

      this.ws.send(JSON.stringify({
        type: "bid.submit",
        payload: bidPayload,
      }));

      elizaLogger.info(`[MarketMaker] 🚀 BID SUBMITTED!`);
      elizaLogger.info(`[MarketMaker] Auction: ${auction.auctionId}`);
      elizaLogger.info(`[MarketMaker] Our wager: ${formatWagerAmount(makerWager.toString())} vs Taker: ${formatWagerAmount(auction.wager)}`);

    } catch (error: any) {
      elizaLogger.error("[MarketMaker] Error submitting bid:", error?.message);
    }
  }

  public stop() {
    elizaLogger.info("[MarketMaker] Stopping...");
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}
