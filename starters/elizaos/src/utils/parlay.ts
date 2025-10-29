import { elizaLogger } from "@elizaos/core";
import { encodeAbiParameters } from "viem";

/**
 * Encode parlay outcomes for UMA resolver
 */
export async function encodeParlayOutcomes(markets: any[], predictions: any[]): Promise<string[]> {
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

    elizaLogger.info(`[Parlay] Encoded ${outcomes.length} predicted outcomes`);
    return [encoded];
  } catch (error) {
    elizaLogger.error("[Parlay] Failed to encode predicted outcomes:", error);
    return predictions.map(p => `0x${p.probability > 50 ? '01' : '00'}`);
  }
}

/**
 * Select the best bid from a list of bids
 */
export function selectBestBid(bids: any[]): any {
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

/**
 * Format wager amount for display
 */
export function formatWagerAmount(wagerAmount: string): string {
  return `${parseFloat(wagerAmount) / 1e18} USDe`;
}