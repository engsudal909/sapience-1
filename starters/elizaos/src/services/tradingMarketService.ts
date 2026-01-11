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
  private readonly MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6");
  
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
    const maxMarketHours = parseInt(process.env.MAX_MARKET_HOURS || "168"); // Default 7 days
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
    // Filter to predictions with any reasonable confidence (minimum 0.5)
    const eligible = predictions.filter(p => p.confidence >= 0.5);
    
    if (eligible.length < 2) {
      elizaLogger.info(`[TradingMarket] Not enough predictions (need at least 2, got ${eligible.length})`);
      return [];
    }

    elizaLogger.info(`[TradingMarket] ${eligible.length} eligible predictions found`);

    // Sort by probability strength (how far from 50%)
    // Higher probability strength = more confident prediction
    const withStrength = eligible.map(p => ({
      ...p,
      probabilityStrength: Math.abs(p.probability - 50) // Distance from 50%
    }));

    // Sort by probability strength (highest first = most decisive predictions)
    const sorted = withStrength.sort((a, b) => b.probabilityStrength - a.probabilityStrength);

    // Pick top 2 with highest probability strength (most decisive predictions)
    const selected = sorted.slice(0, 2);

    elizaLogger.info(`[TradingMarket] Selected 2 HIGHEST PROBABILITY legs for trade:
${selected.map(p => `  - [${p.market.category?.name || 'Unknown'}] ${p.market.question?.substring(0, 50)}... (${p.probability}% ${p.outcome ? 'YES' : 'NO'}, strength: ${p.probabilityStrength}%)`).join('\n')}`);

    return selected;
  }

  async analyzeTradingOpportunity(): Promise<{
    predictions: TradingPrediction[];
    canTrade: boolean;
    reason: string;
  }> {
    try {
      const conditions = await this.fetchTradingMarkets();
      if (conditions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "No eligible conditions available",
        };
      }

      const allPredictions = await this.generateTradingPredictions(conditions);
      if (allPredictions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Failed to generate predictions",
        };
      }

      const selectedPredictions = this.selectTradingLegs(allPredictions);
      if (selectedPredictions.length < 2) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Not enough predictions available (need at least 2)",
        };
      }

      return {
        predictions: selectedPredictions,
        canTrade: true,
        reason: `Found ${selectedPredictions.length} high-confidence predictions from different categories`,
      };
    } catch (error) {
      elizaLogger.error("[TradingMarket] Error analyzing trading opportunity:", error);
      return {
        predictions: [],
        canTrade: false,
        reason: `Error: ${(error as Error).message}`,
      };
    }
  }
}

export default TradingMarketService;

