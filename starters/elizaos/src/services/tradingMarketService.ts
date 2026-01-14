import { elizaLogger, IAgentRuntime, ModelType } from "@elizaos/core";
import { getApiEndpoints } from "../utils/blockchain.js";

interface TradingPrediction {
  marketId: string;
  market: any;
  probability: number;
  confidence: number;
  reasoning: string;
  outcome: boolean;
}

export class TradingMarketService {
  private runtime: IAgentRuntime;
  private readonly MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.4");
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  async fetchTradingMarkets(): Promise<any[]> {
    try {
      elizaLogger.info("[TradingMarket] Fetching trading conditions from GraphQL API");
      
      const { sapienceGraphql } = getApiEndpoints();
      const query =  /* GraphQL */ `
        query Conditions($take: Int, $skip: Int) {
          conditions(orderBy: { createdAt: desc }, take: $take, skip: $skip) {
            id
            createdAt
            question
            shortName
            endTime
            public
            claimStatement
            description
            similarMarkets
            category {
              id
              name
              slug
            }
          }
        }
      `;
      
      const response = await fetch(sapienceGraphql, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { 
            take: parseInt(process.env.TRADING_MARKETS_FETCH_LIMIT || "100"), 
            skip: parseInt(process.env.TRADING_MARKETS_SKIP || "0") 
          }
        })
      });

      const responseText = await response.text();
      elizaLogger.info(`[TradingMarket] GraphQL response status: ${response.status}`);
      elizaLogger.info(`[TradingMarket] GraphQL response preview: ${responseText.substring(0, 200)}...`);
      
      if (!response.ok) {
        elizaLogger.error(`[TradingMarket] GraphQL request failed with status ${response.status}`);
        return [];
      }
      
      const data = JSON.parse(responseText);
      
      if (data.errors) {
        elizaLogger.error(`[TradingMarket] GraphQL errors: ${JSON.stringify(data.errors)}`);
        return [];
      }
      
      const conditions = data.data?.conditions || [];
      
      if (conditions.length === 0) {
        elizaLogger.warn("[TradingMarket] No conditions found in GraphQL response");
        return [];
      }

      return this.filterActiveConditions(conditions);
    } catch (error) {
      elizaLogger.error("[TradingMarket] Error fetching trading conditions:", error);
      return [];
    }
  }

  private filterActiveConditions(conditions: any[]): any[] {
    const now = Math.floor(Date.now() / 1000);
    // Trading uses separate limit (default 7 days) - we want volume, not fast resolution!
    // Forecast uses MAX_MARKET_HOURS (24h) for fast resolution
    // Trading should NOT use MAX_MARKET_HOURS - use TRADING_MAX_MARKET_HOURS or default 168h
    const maxMarketHours = parseInt(process.env.TRADING_MAX_MARKET_HOURS || "168"); // Always 7 days for trading (ignore MAX_MARKET_HOURS)
    const maxEndTime = now + (maxMarketHours * 60 * 60); // Convert hours to seconds
    
    const activeConditions = conditions.filter((condition: any) => {
      // Must be public, not expired, and within time limit
      // Removed similarMarkets filter to allow more markets
      const withinTimeLimit = condition.endTime <= maxEndTime;
      
      return condition.public && 
             condition.endTime && 
             condition.endTime > now &&
             withinTimeLimit;
    });

    elizaLogger.info(`[TradingMarket] Found ${activeConditions.length} tradeable conditions out of ${conditions.length} total (within ${maxMarketHours}h)`);
    
    if (activeConditions.length > 0) {
      elizaLogger.info(`[TradingMarket] Sample condition: ${JSON.stringify(activeConditions[0], null, 2)}`);
    }
    
    return activeConditions;
  }

  async generateTradingPredictions(conditions: any[]): Promise<TradingPrediction[]> {
    const predictions: TradingPrediction[] = [];
    
    for (const condition of conditions) {
      try {
        const prediction = await this.generateSinglePrediction(condition);
        if (prediction) {
          predictions.push(prediction);
        }
      } catch (error) {
        elizaLogger.error(`[TradingMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      }
    }

    return predictions;
  }

  private async generateSinglePrediction(condition: any): Promise<TradingPrediction | null> {
    try {
      const endDate = condition.endTime ? new Date(condition.endTime * 1000).toISOString() : "Unknown";
      const now = new Date();
      const hoursUntilEnd = condition.endTime ? Math.round((condition.endTime * 1000 - now.getTime()) / (1000 * 60 * 60)) : 0;
      
      const predictionPrompt = `
You are analyzing a prediction market. This market HAS BEEN PRE-FILTERED to resolve within 48 hours.

CURRENT TIME: ${now.toISOString()}
MARKET END: ${endDate}
HOURS REMAINING: ${hoursUntilEnd} hours (CONFIRMED within 48h limit)

Question: ${condition.question}
Claim Statement: ${condition.claimStatement}
Description: ${condition.description || "No additional description"}
Category: ${condition.category?.name || "Unknown"}

IMPORTANT: This market resolves in ${hoursUntilEnd} hours. You MUST provide a prediction.
Use historical data, statistics, and current information to make your prediction.

Respond with ONLY valid JSON:
{
  "probability": <number 0-100 - your predicted likelihood>,
  "confidence": <number 0.5-1.0 - how confident you are in your prediction>,
  "reasoning": "<brief analysis under 100 chars>"
}

Base your prediction on available data and evidence.`;

      const response = await this.runtime.useModel(ModelType.TEXT_LARGE, { 
        prompt: predictionPrompt 
      });
      
      // Debug: Log the raw API response
      elizaLogger.info(`[TradingMarket] Raw API response for ${condition.id}:`, typeof response, response?.substring?.(0, 200) || response);
      
      if (!response || response.trim() === '') {
        throw new Error("Empty API response");
      }
      
      let predictionData;
      try {
        predictionData = JSON.parse(response);
      } catch {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          predictionData = JSON.parse(jsonMatch[0]);
        } else {
          elizaLogger.error(`[TradingMarket] Could not parse JSON from response:`, response);
          throw new Error("Invalid JSON response");
        }
      }

      if (!predictionData.probability || predictionData.confidence === undefined || !predictionData.reasoning) {
        elizaLogger.error(`[TradingMarket] Incomplete data:`, predictionData);
        throw new Error("Incomplete prediction data");
      }

      return {
        marketId: condition.id,
        market: condition,
        probability: predictionData.probability,
        confidence: predictionData.confidence,
        reasoning: predictionData.reasoning,
        outcome: predictionData.probability > 50, // YES if >50%, NO if <=50%
      };
    } catch (error) {
      elizaLogger.error(`[TradingMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      return null;
    }
  }

  selectTradingLegs(predictions: TradingPrediction[]): TradingPrediction[] {
    // Filter to predictions that meet minimum confidence from .env
    const minConfidence = this.MIN_CONFIDENCE_THRESHOLD;
    // Filter by probability (chance) - must be at least 40% to ensure win rate
    const MIN_PROBABILITY = 40; // probability must be >= 40% (chance)
    const eligible = predictions.filter(p => 
      p.confidence >= minConfidence && 
      p.probability >= MIN_PROBABILITY
    );
    
    if (eligible.length < 1) {
      elizaLogger.info(`[TradingMarket] Not enough predictions (need at least 1 with confidence >= ${minConfidence} AND probability >= ${MIN_PROBABILITY}%, got ${eligible.length})`);
      return [];
    }

    elizaLogger.info(`[TradingMarket] ${eligible.length} eligible predictions found (will prioritize 50:50 markets via scoring)`);

    // Popular categories that tend to have higher liquidity
    const popularCategories = [
      'crypto', 'cryptocurrency', 'bitcoin', 'ethereum',
      'politics', 'election', 'president',
      'sports', 'nba', 'nfl', 'soccer', 'football',
      'finance', 'stocks', 'market',
      'tech', 'technology', 'ai'
    ];

    // Calculate market score - MAXIMIZING TRADING OPPORTUNITIES
    // Priority: 50:50 Closeness > Confidence > Category > Urgency
    // Strategy: Pick markets close to 50:50 to attract counter-bets!
    // No hard filter - let scoring prioritize 50:50 markets naturally
    const now = Math.floor(Date.now() / 1000);
    const withScore = eligible.map(p => {
      // 50:50 closeness score: 0-100 (MOST IMPORTANT for attracting bids!)
      // Markets at 50% = 100 points, 60% or 40% = 80 points, 70% or 30% = 60 points
      const distanceFrom50 = Math.abs(50 - p.probability);
      const closenessScore = (50 - distanceFrom50) * 2; // Max 100 points at 50%
      
      // Confidence score: 0-100 (still important for quality)
      const confidenceScore = p.confidence * 100;
      
      // Category bonus: +20 points for popular categories
      const categoryName = (p.market.category?.name || '').toLowerCase();
      const categoryBonus = popularCategories.some(cat => categoryName.includes(cat)) ? 20 : 0;
      
      // Time urgency bonus: +10 points for markets ending within 3 days
      const hoursUntilEnd = (p.market.endTime - now) / 3600;
      const urgencyBonus = hoursUntilEnd <= 72 ? 10 : 0;
      
      // Total score = 50:50 closeness + confidence + category + urgency
      // This attracts MORE bids by offering competitive markets!
      const score = closenessScore + confidenceScore + categoryBonus + urgencyBonus;
      
      return {
        ...p,
        closenessScore,
        confidenceScore,
        categoryBonus,
        urgencyBonus,
        score,
        hoursUntilEnd: Math.round(hoursUntilEnd)
      };
    });

    // Sort by total score (highest first)
    const sorted = withScore.sort((a, b) => b.score - a.score);

    // Pick top 1-2 with highest score (1-leg is enough!)
    const selected = sorted.slice(0, Math.min(2, sorted.length));

    elizaLogger.info(`[TradingMarket] Selected ${selected.length} BEST SCORED leg(s) for trade (50:50 PRIORITY - ATTRACT BIDS!):
${selected.map(p => `  - [${p.market.category?.name || 'Unknown'}] ${p.market.question?.substring(0, 60)}...
    Prob: ${p.probability}% ${p.outcome ? 'YES' : 'NO'} | Conf: ${(p.confidence * 100).toFixed(0)}% | Score: ${p.score.toFixed(1)} (50:50:${p.closenessScore.toFixed(1)} conf:${p.confidenceScore.toFixed(1)} cat:${p.categoryBonus} urgency:${p.urgencyBonus}) | Ends in ${p.hoursUntilEnd}h`).join('\n')}`);

    return selected;
  }

  async analyzeTradingOpportunity(): Promise<{
    predictions: TradingPrediction[];
    canTrade: boolean;
    reason: string;
    marketsAnalyzed: number;
  }> {
    try {
      const conditions = await this.fetchTradingMarkets();
      const marketsAnalyzed = conditions.length;
      
      if (conditions.length === 0) {
        elizaLogger.warn(`[TradingMarket] No markets found. Check MAX_MARKET_HOURS filter (current: ${process.env.MAX_MARKET_HOURS || '168'})`);
        return {
          predictions: [],
          canTrade: false,
          reason: "No eligible conditions available",
          marketsAnalyzed: 0,
        };
      }

      // Limit markets to analyze to reduce API costs (analyze top 20 only)
      const MAX_MARKETS_TO_ANALYZE = parseInt(process.env.TRADING_MAX_MARKETS_TO_ANALYZE || "20");
      const marketsToAnalyze = conditions.slice(0, MAX_MARKETS_TO_ANALYZE);
      
      elizaLogger.info(`[TradingMarket] Found ${conditions.length} eligible markets, analyzing top ${marketsToAnalyze.length} to reduce API costs...`);
      const allPredictions = await this.generateTradingPredictions(marketsToAnalyze);
      
      if (allPredictions.length === 0) {
        elizaLogger.warn(`[TradingMarket] Failed to generate predictions from ${conditions.length} markets`);
        return {
          predictions: [],
          canTrade: false,
          reason: "Failed to generate predictions",
          marketsAnalyzed,
        };
      }

      elizaLogger.info(`[TradingMarket] Generated ${allPredictions.length} predictions, selecting best legs...`);
      const selectedPredictions = this.selectTradingLegs(allPredictions);
      
      if (selectedPredictions.length < 1) {
        elizaLogger.warn(`[TradingMarket] Only ${selectedPredictions.length} predictions passed filters (need at least 1)`);
        return {
          predictions: [],
          canTrade: false,
          reason: "Not enough predictions available (need at least 1)",
          marketsAnalyzed,
        };
      }

      return {
        predictions: selectedPredictions,
        canTrade: true,
        reason: `Found ${selectedPredictions.length} high-confidence predictions from different categories`,
        marketsAnalyzed,
      };
    } catch (error) {
      elizaLogger.error("[TradingMarket] Error analyzing trading opportunity:", error);
      return {
        predictions: [],
        canTrade: false,
        reason: `Error: ${(error as Error).message}`,
        marketsAnalyzed: 0,
      };
    }
  }
}

export default TradingMarketService;

