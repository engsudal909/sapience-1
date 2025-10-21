import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
import { encodeAbiParameters, keccak256, stringToBytes } from 'viem';
// Removed Socket.IO - using native WebSocket instead
import { privateKeyToAddress } from "viem/accounts";
// Sapience WebSocket endpoint for parlay auctions
// Note: This may need to be updated with the correct production URL
const SAPIENCE_WS_URL = "wss://api.sapience.xyz/auction";

// Local implementation of auction payload building
interface PredictedOutcomeInputStub {
  marketId: string; // The id from API (already encoded claim:endTime)
  prediction: boolean;
}

function isHexAddress(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function encodePredictedOutcomes(
  outcomes: PredictedOutcomeInputStub[]
): `0x${string}` {
  // Convert marketId string to bytes32 format
  const normalized = outcomes.map((o) => ({
    marketId: (o.marketId.startsWith('0x')
      ? o.marketId
      : `0x${o.marketId}`) as `0x${string}`,
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
  // Use the provided resolver override or UMA resolver address for Arbitrum
  const UMA_RESOLVER_ADDRESS = "0xa6147867264374F324524E30C02C331cF28aa879";
  const resolver: `0x${string}` = isHexAddress(resolverOverride)
    ? resolverOverride
    : UMA_RESOLVER_ADDRESS;

  // Resolver expects a single bytes blob with abi.encode(PredictedOutcome[])
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
          text: 'Provide market data and prediction: {"market": {...}, "prediction": {...}} or {"parlayLegs": [...]}',
          content: {},
        });
        return;
      }

      const data = JSON.parse(jsonMatch[0]);
      
      // Check if this is a multi-leg parlay or single market
      let parlayLegs: Array<{ market: any; prediction: any }> = [];
      
      if (data.parlayLegs && Array.isArray(data.parlayLegs)) {
        // Multi-leg parlay
        parlayLegs = data.parlayLegs;
        elizaLogger.info(`[ParlayTrading] Processing ${parlayLegs.length}-leg parlay`);
      } else if (data.market && data.prediction) {
        // Single market (legacy support)
        parlayLegs = [{ market: data.market, prediction: data.prediction }];
        elizaLogger.info(`[ParlayTrading] Processing single market as 1-leg parlay`);
      } else {
        await callback?.({
          text: 'Invalid format. Provide {"parlayLegs": [...]} for multi-leg or {"market": {...}, "prediction": {...}} for single',
          content: {},
        });
        return;
      }

      // Get trading configuration
      const config: ParlayTradingConfig = {
        enabled: true,
        wagerAmount: process.env.PARLAY_WAGER_AMOUNT || process.env.WAGER_AMOUNT || "1000000000000000000", // $1 in USDe (18 decimals)
        minProbabilityThreshold: parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6"),
        maxSlippage: parseFloat(process.env.MAX_TRADING_SLIPPAGE || "5"), // 5%
      };

      // Check if all legs meet confidence threshold
      const lowConfidenceLegs = parlayLegs.filter(leg => leg.prediction.confidence < config.minProbabilityThreshold);
      if (lowConfidenceLegs.length > 0) {
        elizaLogger.info(
          `[ParlayTrading] Skipping trade - ${lowConfidenceLegs.length} legs below confidence threshold`,
        );
        await callback?.({
          text: `Skipping trade: ${lowConfidenceLegs.length} legs below confidence threshold ${config.minProbabilityThreshold}`,
          content: {},
        });
        return;
      }

      // Build parlay outcomes array
      const parlayOutcomes = parlayLegs.map(leg => ({
        market: leg.market,
        outcome: leg.prediction.probability > 50, // true for YES, false for NO
        prediction: leg.prediction
      }));

      elizaLogger.info(
        `[ParlayTrading] Trading ${parlayLegs.length}-leg parlay:`,
        JSON.stringify(parlayOutcomes.map(o => ({
          market: o.market.question?.substring(0, 50),
          direction: o.outcome ? "YES" : "NO",
          confidence: o.prediction.confidence
        })))
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

      // Start auction via WebSocket with all parlay legs
      const auctionResult = await startAuction({
        parlayOutcomes,
        walletAddress,
        wagerAmount: config.wagerAmount,
        rpcUrl,
      });

      if (auctionResult.success) {
        elizaLogger.info(
          `[ParlayTrading] ${parlayLegs.length}-leg parlay executed successfully: ${auctionResult.txHash}`,
        );
        await callback?.({
          text: `${parlayLegs.length}-leg parlay executed: ${parlayOutcomes.map(o => 
            `${o.outcome ? "YES" : "NO"} on "${o.market.question?.substring(0, 30)}..."`
          ).join(', ')} (TX: ${auctionResult.txHash})`,
          content: {
            success: true,
            legs: parlayOutcomes.map(o => ({
              direction: o.outcome ? "YES" : "NO",
              market: o.market.question,
              confidence: o.prediction.confidence
            })),
            txHash: auctionResult.txHash,
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
  parlayOutcomes,
  walletAddress,
  wagerAmount,
  rpcUrl,
}: {
  parlayOutcomes: Array<{
    market: any;
    outcome: boolean;
    prediction: any;
  }>;
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

        // Debug log the parlay legs
        elizaLogger.info(`[ParlayTrading] Processing ${parlayOutcomes.length}-leg parlay`);

        // Generate maker nonce (timestamp + random)
        const makerNonce = Date.now().toString() + Math.random().toString(36).substring(2);

        // Build properly encoded predicted outcomes for ALL legs
        const outcomes: PredictedOutcomeInputStub[] = parlayOutcomes.map(leg => {
          const market = leg.market;
          
          // Debug log for each market
          elizaLogger.info(`[ParlayTrading] Leg: ${market.question?.substring(0, 50)} - ${leg.outcome ? 'YES' : 'NO'}`);
          
          // Use the proper conditionId format: hash(claim:endTime) to get bytes32
          const claimHex = market.claimStatementYesOrNumeric || "0x";
          const endTime = market.endTimestamp || 0;
          const conditionString = `${claimHex}:${endTime}`;
          const conditionId = keccak256(stringToBytes(conditionString));
          
          elizaLogger.info(`[ParlayTrading] Market ${market.id}: conditionId=${conditionId}`);
          
          return {
            marketId: conditionId,
            prediction: leg.outcome
          };
        });
        
        // Use the first market's group address as resolver (they should all be in same group for parlay)
        // Or we might need to use a special parlay resolver
        const marketGroup = parlayOutcomes[0].market.marketGroupAddress || 
                           parlayOutcomes[0].market.contractAddress || 
                           parlayOutcomes[0].market.address || 
                           "0x0000000000000000000000000000000000000000";
        
        elizaLogger.info(`[ParlayTrading] Using resolver: ${marketGroup}`);
        
        try {
          const payload = buildAuctionStartPayload(outcomes, marketGroup);
          elizaLogger.info(`[ParlayTrading] Payload built: ${JSON.stringify(payload)}`);

          // Start auction with proper message format
          const auctionMessage = {
            type: "auction.start",
            payload: {
              maker: walletAddress,
              wager: wagerAmount,
              resolver: payload.resolver,
              predictedOutcomes: payload.predictedOutcomes,
              makerNonce,
            },
          };
        
          elizaLogger.info(`[ParlayTrading] Starting auction with params: ${JSON.stringify(auctionMessage)}`);
          socket.send(JSON.stringify(auctionMessage));
        } catch (error: any) {
          elizaLogger.error(`[ParlayTrading] Error building auction payload: ${error.message}`);
          resolveOnce({ success: false, error: error.message });
          return;
        }
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

            // Select best bid (for parlay, we need to consider all outcomes)
            // For simplicity, just use the first bid for now
            const bestBid = selectBestBid(bids, true); // We'll refine this logic later
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