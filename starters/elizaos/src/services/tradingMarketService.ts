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

let lastTradeTimestamp = 0;

export class TradingMarketService {
  private runtime: IAgentRuntime;
  private readonly MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6");
  private readonly MIN_HOURS_BETWEEN_TRADES = parseFloat(process.env.MIN_HOURS_BETWEEN_TRADES || "24");
  private readonly MIN_PREDICTION_CHANGE = parseFloat(process.env.MIN_TRADING_PREDICTION_CHANGE || "10");
  
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
    const activeConditions = conditions.filter((condition: any) => {
      return condition.public && 
             condition.endTime && 
             condition.endTime > now;
    });

    elizaLogger.info(`[TradingMarket] Found ${activeConditions.length} active trading conditions out of ${conditions.length} total`);
    
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
      
      const predictionPrompt = `
You are analyzing a prediction condition for trading. Provide a focused analysis.

Question: ${condition.question}
Claim Statement: ${condition.claimStatement}
Description: ${condition.description || "No additional description"}
End Date: ${endDate}
Category: ${condition.category?.name || "Unknown"}

Analyze this condition and respond with ONLY valid JSON:
{
  "probability": <number 0-100>,
  "confidence": <number 0.0-1.0>,
  "reasoning": "<concise analysis under 100 characters>"
}

Focus on objective factors and data-driven analysis.`;

      const response = await this.runtime.useModel(ModelType.TEXT_SMALL, { 
        prompt: predictionPrompt 
      });
      
      let predictionData;
      try {
        predictionData = JSON.parse(response);
      } catch {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          predictionData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Invalid JSON response");
        }
      }

      if (!predictionData.probability || predictionData.confidence === undefined || !predictionData.reasoning) {
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
    const eligible = predictions.filter(p => p.confidence >= this.MIN_CONFIDENCE_THRESHOLD);
    
    if (eligible.length === 0) {
      elizaLogger.info("[TradingMarket] No predictions meet confidence threshold");
      return [];
    }

    eligible.sort((a, b) => b.confidence - a.confidence);

    const selected: TradingPrediction[] = [];
    let targetCount = 3;
    
    for (let i = 0; i < eligible.length && i < targetCount; i++) {
      selected.push(eligible[i]);
      
      if (i === 2 && i + 1 < eligible.length && 
          eligible[i].confidence === eligible[i + 1].confidence) {
        targetCount++;
      }
    }

    elizaLogger.info(`[TradingMarket] Selected ${selected.length} legs for trade:
${selected.map(p => `  - ${p.market.question?.substring(0, 50)}... (${p.probability}% ${p.outcome ? 'YES' : 'NO'}, confidence: ${p.confidence})`).join('\n')}`);

    return selected;
  }

  canPlaceTrade(): { allowed: boolean; reason: string } {
    if (lastTradeTimestamp === 0) {
      return { allowed: true, reason: "First trade" };
    }

    const hoursSinceLastTrade = (Date.now() - lastTradeTimestamp) / (1000 * 60 * 60);
    
    if (hoursSinceLastTrade < this.MIN_HOURS_BETWEEN_TRADES) {
      return { 
        allowed: false, 
        reason: `Only ${hoursSinceLastTrade.toFixed(1)} hours since last trade (need ${this.MIN_HOURS_BETWEEN_TRADES} hours)` 
      };
    }

    return { 
      allowed: true, 
      reason: "24 hours have passed since last trade" 
    };
  }

  recordTrade(): void {
    lastTradeTimestamp = Date.now();
    elizaLogger.info("[TradingMarket] Recorded trade timestamp for rate limiting");
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
          reason: "Not enough high-confidence predictions for trade",
        };
      }

      const rateCheck = this.canPlaceTrade();
      
      return {
        predictions: selectedPredictions,
        canTrade: rateCheck.allowed,
        reason: rateCheck.reason,
      };
    } catch (error) {
      elizaLogger.error("[TradingMarket] Error analyzing trading opportunity:", error);
      return {
        predictions: [],
        canTrade: false,
        reason: `Error: ${error.message}`,
      };
    }
  }
}

export default TradingMarketService;

