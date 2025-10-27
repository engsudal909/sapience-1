import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
import { encodeAbiParameters } from 'viem';
import { privateKeyToAddress } from "viem/accounts";
import ParlayMarketService from "../services/parlayMarketService.js";

// Sapience WebSocket endpoint for parlay auctions
const SAPIENCE_WS_URL = "wss://api.sapience.xyz/auction";

interface PredictedOutcomeInputStub {
  marketId: string;
  prediction: boolean;
}

function isHexAddress(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function encodePredictedOutcomes(outcomes: PredictedOutcomeInputStub[]): `0x${string}` {
  const normalized = outcomes.map((o) => ({
    marketId: (o.marketId.startsWith('0x') ? o.marketId : `0x${o.marketId}`) as `0x${string}`,
    prediction: !!o.prediction,
  }));

  return encodeAbiParameters(
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
}

function buildAuctionStartPayload(
  outcomes: PredictedOutcomeInputStub[],
  resolverOverride?: string
): { resolver: `0x${string}`; predictedOutcomes: `0x${string}`[] } {
  const UMA_RESOLVER_ADDRESS = "0xa6147867264374F324524E30C02C331cF28aa879";
  const resolver: `0x${string}` = isHexAddress(resolverOverride) ? resolverOverride : UMA_RESOLVER_ADDRESS;

  const encoded = encodePredictedOutcomes(outcomes);
  const predictedOutcomes = [encoded];

  return { resolver, predictedOutcomes };
}

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

export const parlayTradingAction: Action = {
  name: "PARLAY_TRADING",
  description: "Analyze parlay markets and place multi-leg bets on highest confidence predictions",
  similes: ["trade parlay", "make parlay bet", "analyze parlay"],

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

      elizaLogger.info("[ParlayTrading] Starting parlay analysis...");

      // Initialize parlay market service
      const parlayService = new ParlayMarketService(runtime);

      // Analyze parlay opportunity
      const analysis = await parlayService.analyzeParlayOpportunity();

      if (!analysis.canTrade) {
        elizaLogger.info(`[ParlayTrading] Cannot trade: ${analysis.reason}`);
        await callback?.({
          text: `Parlay trading skipped: ${analysis.reason}`,
          content: { analysis },
        });
        return;
      }

      if (analysis.predictions.length < 2) {
        elizaLogger.info("[ParlayTrading] Not enough predictions for parlay");
        await callback?.({
          text: "Not enough high-confidence predictions available for parlay betting",
          content: { analysis },
        });
        return;
      }

      elizaLogger.info(`[ParlayTrading] Found ${analysis.predictions.length}-leg parlay opportunity`);

      // Get trading configuration
      const config: ParlayTradingConfig = {
        enabled: true,
        wagerAmount: process.env.PARLAY_WAGER_AMOUNT || process.env.WAGER_AMOUNT || "1000000000000000000", // $1 in USDe (18 decimals)
        minProbabilityThreshold: parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6"),
        maxSlippage: parseFloat(process.env.MAX_TRADING_SLIPPAGE || "5"), // 5%
      };

      // Check if all legs meet minimum confidence
      const lowConfidenceLegs = analysis.predictions.filter(p => p.confidence < config.minProbabilityThreshold);
      if (lowConfidenceLegs.length > 0) {
        elizaLogger.info(`[ParlayTrading] ${lowConfidenceLegs.length} legs below trading confidence threshold`);
        await callback?.({
          text: `Parlay skipped: ${lowConfidenceLegs.length} legs below confidence threshold ${config.minProbabilityThreshold}`,
          content: { analysis },
        });
        return;
      }

      // Build parlay outcomes
      const parlayOutcomes = analysis.predictions.map(pred => ({
        marketId: pred.marketId,
        market: pred.market,
        outcome: pred.outcome,
        probability: pred.probability,
      }));

      elizaLogger.info(`[ParlayTrading] Executing ${parlayOutcomes.length}-leg parlay:
${parlayOutcomes.map(leg => 
  `  - ${leg.market.question?.substring(0, 50)}... → ${leg.outcome ? 'YES' : 'NO'} (${leg.probability}%)`
).join('\n')}`);

      // Execute the parlay trade
      const auctionResult = await executeParlay({
        parlayOutcomes,
        wagerAmount: config.wagerAmount,
        privateKey: process.env.ETHEREUM_PRIVATE_KEY || process.env.EVM_PRIVATE_KEY || "",
        rpcUrl: process.env.EVM_PROVIDER_URL || "https://arb1.arbitrum.io/rpc",
      });

      if (auctionResult.success) {
        // Record the parlay bet for rate limiting
        parlayService.recordParlayBet();

        elizaLogger.info(`[ParlayTrading] ${parlayOutcomes.length}-leg parlay executed successfully: ${auctionResult.txHash}`);
        
        await callback?.({
          text: `✅ ${parlayOutcomes.length}-leg parlay executed successfully!
${parlayOutcomes.map(leg => 
  `• ${leg.market.question?.substring(0, 40)}... → ${leg.outcome ? 'YES' : 'NO'}`
).join('\n')}

Transaction: ${auctionResult.txHash}`,
          content: {
            success: true,
            txHash: auctionResult.txHash,
            legs: parlayOutcomes,
            analysis,
          },
        });
      } else {
        elizaLogger.error("[ParlayTrading] Parlay execution failed:", auctionResult.error);
        await callback?.({
          text: `❌ Parlay execution failed: ${auctionResult.error}`,
          content: {
            success: false,
            error: auctionResult.error,
            analysis,
          },
        });
      }
    } catch (err: any) {
      elizaLogger.error("[ParlayTrading] Trading failed:", err);
      await callback?.({
        text: `Error in parlay trading: ${err.message}`,
        content: { error: err.message },
      });
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "analyze parlay" },
      },
      {
        name: "{{agent}}",
        content: { text: "Analyzing parlay betting opportunities..." },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "trade parlay" },
      },
      {
        name: "{{agent}}",
        content: { text: "Looking for high-confidence parlay opportunities..." },
      },
    ],
  ],
};

async function executeParlay({
  parlayOutcomes,
  wagerAmount,
  privateKey,
  rpcUrl,
}: {
  parlayOutcomes: Array<{
    marketId: string;
    market: any;
    outcome: boolean;
  }>;
  wagerAmount: string;
  privateKey: string;
  rpcUrl: string;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(SAPIENCE_WS_URL);

    // Timeout handling
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ success: false, error: "Auction timeout" });
    }, 30000);

    let resolveOnce = (result: any) => {
      clearTimeout(timeout);
      resolve(result);
      resolveOnce = () => {}; // Prevent multiple calls
    };

    try {
      ws.onopen = () => {
        elizaLogger.info("[ParlayTrading] Connected to auction WebSocket");

        try {
          // Build predicted outcomes for auction
          const outcomes: PredictedOutcomeInputStub[] = parlayOutcomes.map(leg => {
            const condition = leg.market; // This is actually a condition now
            
            // For conditions, use the condition ID directly as it's already in the correct format
            const conditionId = condition.id.startsWith('0x') ? condition.id : `0x${condition.id}`;
            // Ensure it's padded to 32 bytes (66 chars including 0x)
            const paddedConditionId = conditionId.padEnd(66, '0');
            
            elizaLogger.info(`[ParlayTrading] Leg: ${condition.question?.substring(0, 50)} - ${leg.outcome ? 'YES' : 'NO'}`);
            elizaLogger.info(`[ParlayTrading] Condition ${condition.id}: using conditionId=${paddedConditionId}`);
            
            return {
              marketId: paddedConditionId,
              prediction: leg.outcome,
            };
          });

          // Use UMA resolver for conditions (parlay markets)
          const UMA_RESOLVER = "0xa6147867264374F324524E30C02C331cF28aa879";
          const marketGroup = UMA_RESOLVER; // Conditions use UMA resolver

          elizaLogger.info(`[ParlayTrading] Using resolver: ${marketGroup}`);

          const payload = buildAuctionStartPayload(outcomes, marketGroup);
          elizaLogger.info(`[ParlayTrading] Payload built: ${JSON.stringify(payload)}`);

          const auctionMessage = {
            type: "start",
            payload: {
              maker: privateKeyToAddress(privateKey as `0x${string}`),
              wager: wagerAmount,
              resolver: payload.resolver,
              outcomes: outcomes.map(o => o.prediction),
              makerNonce: Math.floor(Math.random() * 1000000).toString(),
            },
          };

          elizaLogger.info(`[ParlayTrading] Starting auction: ${JSON.stringify(auctionMessage)}`);
          ws.send(JSON.stringify(auctionMessage));
        } catch (error: any) {
          elizaLogger.error(`[ParlayTrading] Error building auction payload: ${error.message}`);
          resolveOnce({ success: false, error: error.message });
        }
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          elizaLogger.info(`[ParlayTrading] Received message: ${JSON.stringify(message)}`);

          if (message.type === "ack") {
            elizaLogger.info(`[ParlayTrading] Auction acknowledged: ${JSON.stringify(message.payload)}`);
          } else if (message.type === "bids") {
            const bids = message.payload;
            elizaLogger.info(`[ParlayTrading] Received ${bids.length} bids`);

            if (bids.length === 0) {
              resolveOnce({ success: false, error: "No bids received" });
              return;
            }

            // Select best bid
            const bestBid = selectBestBid(bids, parlayOutcomes[0].outcome);
            elizaLogger.info(`[ParlayTrading] Selected best bid: ${JSON.stringify(bestBid)}`);

            // Accept the bid
            try {
              const txHash = await acceptBid({ bid: bestBid, privateKey, rpcUrl });
              resolveOnce({ success: true, txHash });
            } catch (error: any) {
              elizaLogger.error("[ParlayTrading] Failed to accept bid:", error);
              resolveOnce({ success: false, error: error.message });
            }
          } else if (message.type === "error") {
            elizaLogger.error("[ParlayTrading] Auction error:", message.payload);
            resolveOnce({ success: false, error: message.payload.message || "Auction failed" });
          }
        } catch (error: any) {
          elizaLogger.error("[ParlayTrading] Error processing message:", error);
        }
      };

      ws.onerror = (error: Event) => {
        elizaLogger.error("[ParlayTrading] WebSocket error:", error.type);
        resolveOnce({ success: false, error: "WebSocket connection failed" });
      };

      ws.onclose = (event) => {
        elizaLogger.info(`[ParlayTrading] WebSocket closed: ${event.code} ${event.reason}`);
        if (event.code === 1006) {
          elizaLogger.warn("[ParlayTrading] Connection closed abnormally - server may not be available");
          resolveOnce({ success: false, error: "Auction service not available" });
        } else {
          resolveOnce({ success: false, error: "WebSocket disconnected" });
        }
      };
    } catch (error: any) {
      resolve({ success: false, error: error.message });
    }
  });
}

function selectBestBid(bids: Bid[], outcome: boolean): Bid {
  const now = Date.now() / 1000;
  const validBids = bids.filter((bid) => bid.deadline > now);
  
  if (validBids.length === 0) {
    throw new Error("No valid bids available");
  }

  const sortedBids = validBids.sort((a, b) => {
    const wagerA = parseFloat(a.wager);
    const wagerB = parseFloat(b.wager);
    return wagerB - wagerA;
  });

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

    // First, approve the collateral token
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
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Execute mint transaction
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
  const { encodeFunctionData } = await import("viem");
  
  const mintRequest = {
    predictedOutcomes: [bid.outcome],
    resolver: bid.predictionMarket,
    makerCollateral: BigInt(bid.wager),
    takerCollateral: BigInt(bid.wager),
    makerSignature: "0x",
    takerSignature: "0x",
    deadline: BigInt(bid.deadline),
  };
  
  return encodeFunctionData({
    abi: [
      {
        name: "mint",
        type: "function",
        inputs: [
          { name: "request", type: "tuple", components: [] }, // Simplified
        ],
        outputs: [],
      },
    ],
    functionName: "mint",
    args: [mintRequest as any],
  });
}

export default parlayTradingAction;