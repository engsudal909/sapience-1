import { elizaLogger } from "@elizaos/core";
import { encodeAbiParameters } from "viem";

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
 * Encode trade outcomes for UMA resolver
 */
export async function encodeTradeOutcomes(markets: any[], predictions: any[]): Promise<string[]> {
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

    elizaLogger.info(`[Trading] Encoded ${outcomes.length} predicted outcomes`);
    return [encoded];
  } catch (error) {
    elizaLogger.error("[Trading] Failed to encode predicted outcomes:", error);
    return predictions.map(p => `0x${p.probability > 50 ? '01' : '00'}`);
  }
}

/**
 * Select the best bid from a list of bids
 */
export function selectBestBid(bids: Bid[]): Bid {
  const now = Date.now() / 1000;
  
  // Filter out quote-only bids (maker: 0x0000... or signature: 0x0000...)
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ZERO_SIGNATURE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  
  const actionableBids = bids.filter((bid) => {
    // Must have valid deadline
    if (bid.makerDeadline <= now) return false;
    
    // Must NOT be quote-only (maker address must not be 0x0000...)
    if (bid.maker === ZERO_ADDRESS || bid.maker.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
      elizaLogger.info(`[Trading] Filtering out quote-only bid (maker: ${bid.maker})`);
      return false;
    }
    
    // Must have valid signature (not 0x0000...)
    if (bid.makerSignature === ZERO_SIGNATURE || bid.makerSignature.toLowerCase() === ZERO_SIGNATURE.toLowerCase()) {
      elizaLogger.info(`[Trading] Filtering out bid with zero signature`);
      return false;
    }
    
    return true;
  });
  
  if (actionableBids.length === 0) {
    elizaLogger.warn(`[Trading] No actionable bids found. Total bids: ${bids.length}, Quote-only bids filtered.`);
    throw new Error("No actionable bids available - only quote-only bids received");
  }

  elizaLogger.info(`[Trading] Found ${actionableBids.length} actionable bids (filtered ${bids.length - actionableBids.length} quote-only bids)`);

  const sortedBids = actionableBids.sort((a, b) => {
    const wagerA = parseFloat(a.makerWager || '0');
    const wagerB = parseFloat(b.makerWager || '0');
    return wagerB - wagerA;
  });

  return sortedBids[0];
}

/**
 * Format wager amount for display
 */
export function formatWagerAmount(wagerAmount: string): string {
  return `${parseFloat(wagerAmount) / 1e18} USDe`;
}

