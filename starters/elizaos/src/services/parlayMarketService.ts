import { elizaLogger, IAgentRuntime, ModelType } from "@elizaos/core";
import type { SapienceService } from "./sapienceService.js";

interface ParlayPrediction {
  marketId: string;
  market: any;
  probability: number;
  confidence: number;
  reasoning: string;
  outcome: boolean; // true for YES, false for NO
}

interface ParlayBet {
  marketIds: string[];
  predictions: ParlayPrediction[];
  totalConfidence: number;
  timestamp: number;
}

// Track last parlay bet timestamp for 24-hour rate limiting
let lastParlayTimestamp = 0;

export class ParlayMarketService {
  private runtime: IAgentRuntime;
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.6;
  private readonly MIN_HOURS_BETWEEN_PARLAYS = 24;
  private readonly MIN_PREDICTION_CHANGE = 10; // 10% change required
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Fetch conditions (parlay markets) from the correct API endpoint
   * Parlay markets are stored as "conditions" in the GraphQL API, not in the spot markets endpoint
   */
  async fetchParlayMarkets(): Promise<any[]> {
    try {
      const sapienceService = this.runtime.getService("sapience") as SapienceService;
      if (!sapienceService) {
        elizaLogger.error("[ParlayMarket] Sapience service not available");
        return [];
      }

      elizaLogger.info("[ParlayMarket] Fetching parlay conditions from GraphQL API");
      
      // Use the correct GraphQL query for conditions (parlay markets)
      // First let's try to find the correct tool name by listing available tools
      elizaLogger.info("[ParlayMarket] Attempting to fetch conditions via available GraphQL tools");
      
      let conditionsResponse;
      
      // Try different potential GraphQL tool names
      const graphqlToolNames = ["query_sapience_graphql", "graphql", "graphql_query", "query", "conditions"];
      
      for (const toolName of graphqlToolNames) {
        try {
          elizaLogger.info(`[ParlayMarket] Trying GraphQL tool: ${toolName}`);
          // Structure the call differently based on the tool
          if (toolName === "query_sapience_graphql") {
            conditionsResponse = await sapienceService.callTool("sapience", toolName, {
              query: `
                query Conditions($take: Int) {
                  conditions(orderBy: { createdAt: desc }, take: $take) {
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
              `,
              variables: JSON.stringify({ take: 100 })
            });
          } else {
            conditionsResponse = await sapienceService.callTool("sapience", toolName, {
              query: `
                query Conditions($take: Int) {
                  conditions(orderBy: { createdAt: desc }, take: $take) {
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
              `,
              variables: {
                take: 100
              }
            });
          }
          
          elizaLogger.info(`[ParlayMarket] Tool ${toolName} response preview: ${conditionsResponse?.content?.[0]?.text?.substring(0, 200) || "No response"}...`);
          
          if (conditionsResponse?.content?.[0]?.text && !conditionsResponse.content[0].text.includes("MCP")) {
            elizaLogger.info(`[ParlayMarket] Successfully fetched conditions using tool: ${toolName}`);
            break;
          }
        } catch (error) {
          elizaLogger.info(`[ParlayMarket] Tool ${toolName} failed: ${error.message}`);
        }
      }

      if (!conditionsResponse?.content?.[0]?.text) {
        elizaLogger.error("[ParlayMarket] Failed to fetch conditions from GraphQL - no response content");
        return [];
      }

      const responseText = conditionsResponse.content[0].text;
      elizaLogger.info(`[ParlayMarket] GraphQL response preview: ${responseText.substring(0, 200)}...`);
      
      if (responseText.includes("MCP")) {
        elizaLogger.error("[ParlayMarket] Received MCP error response instead of GraphQL data");
        elizaLogger.info("[ParlayMarket] Falling back to REST API for conditions");
        
        // Try to fetch conditions via REST API as fallback
        try {
          const restResponse = await sapienceService.callTool("sapience", "list_conditions", {});
          if (restResponse?.content?.[0]?.text) {
            const restData = JSON.parse(restResponse.content[0].text);
            elizaLogger.info(`[ParlayMarket] REST API returned ${restData.length || 0} conditions`);
            return restData || [];
          }
        } catch (restError) {
          elizaLogger.info(`[ParlayMarket] REST API fallback also failed: ${restError.message}`);
        }
        
        return [];
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        elizaLogger.error(`[ParlayMarket] Failed to parse GraphQL response: ${parseError.message}`);
        elizaLogger.error(`[ParlayMarket] Response text: ${responseText}`);
        return [];
      }
      
      const conditions = data.data?.conditions || [];
      
      if (conditions.length === 0) {
        elizaLogger.warn("[ParlayMarket] No conditions found in GraphQL response");
        return [];
      }

      // Filter for public conditions that are still active
      const now = Math.floor(Date.now() / 1000);
      const activeConditions = conditions.filter((condition: any) => {
        return condition.public && 
               condition.endTime && 
               condition.endTime > now;
      });

      elizaLogger.info(`[ParlayMarket] Found ${activeConditions.length} active parlay conditions out of ${conditions.length} total`);
      
      if (activeConditions.length > 0) {
        elizaLogger.info(`[ParlayMarket] Sample condition: ${JSON.stringify(activeConditions[0], null, 2)}`);
      }
      
      return activeConditions;
    } catch (error) {
      elizaLogger.error("[ParlayMarket] Error fetching parlay conditions:", error);
      return [];
    }
  }

  /**
   * Generate predictions for parlay conditions without on-chain attestation
   */
  async generateParlayPredictions(conditions: any[]): Promise<ParlayPrediction[]> {
    const predictions: ParlayPrediction[] = [];
    
    for (const condition of conditions) {
      try {
        const prediction = await this.generateSinglePrediction(condition);
        if (prediction) {
          predictions.push(prediction);
        }
      } catch (error) {
        elizaLogger.error(`[ParlayMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      }
    }

    return predictions;
  }

  /**
   * Generate a single condition prediction
   */
  private async generateSinglePrediction(condition: any): Promise<ParlayPrediction | null> {
    try {
      const endDate = condition.endTime ? new Date(condition.endTime * 1000).toISOString() : "Unknown";
      
      const predictionPrompt = `
You are analyzing a prediction condition for parlay betting. Provide a focused analysis.

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
      elizaLogger.error(`[ParlayMarket] Failed to generate prediction for condition ${condition.id}:`, error);
      return null;
    }
  }

  /**
   * Select the best markets for a parlay bet
   * Picks top 3 by confidence, adds more if there are ties
   */
  selectParlayLegs(predictions: ParlayPrediction[]): ParlayPrediction[] {
    // Filter by minimum confidence
    const eligible = predictions.filter(p => p.confidence >= this.MIN_CONFIDENCE_THRESHOLD);
    
    if (eligible.length === 0) {
      elizaLogger.info("[ParlayMarket] No predictions meet confidence threshold");
      return [];
    }

    // Sort by confidence (highest first)
    eligible.sort((a, b) => b.confidence - a.confidence);

    // Take top 3
    const selected: ParlayPrediction[] = [];
    let targetCount = 3;
    
    for (let i = 0; i < eligible.length && i < targetCount; i++) {
      selected.push(eligible[i]);
      
      // If we have 3 and the next one has the same confidence, include it too
      if (i === 2 && i + 1 < eligible.length && 
          eligible[i].confidence === eligible[i + 1].confidence) {
        targetCount++; // Allow one more
      }
    }

    elizaLogger.info(`[ParlayMarket] Selected ${selected.length} legs for parlay:
${selected.map(p => `  - ${p.market.question?.substring(0, 50)}... (${p.probability}% ${p.outcome ? 'YES' : 'NO'}, confidence: ${p.confidence})`).join('\n')}`);

    return selected;
  }

  /**
   * Check if we can place a new parlay bet (simple 24-hour rate limiting)
   */
  canPlaceParlay(): { allowed: boolean; reason: string } {
    if (lastParlayTimestamp === 0) {
      return { allowed: true, reason: "First parlay bet" };
    }

    const hoursSinceLastParlay = (Date.now() - lastParlayTimestamp) / (1000 * 60 * 60);
    
    if (hoursSinceLastParlay < this.MIN_HOURS_BETWEEN_PARLAYS) {
      return { 
        allowed: false, 
        reason: `Only ${hoursSinceLastParlay.toFixed(1)} hours since last parlay (need ${this.MIN_HOURS_BETWEEN_PARLAYS} hours)` 
      };
    }

    return { 
      allowed: true, 
      reason: "24 hours have passed since last parlay" 
    };
  }

  /**
   * Record a parlay bet for rate limiting
   */
  recordParlayBet(): void {
    lastParlayTimestamp = Date.now();
    elizaLogger.info("[ParlayMarket] Recorded parlay bet timestamp for rate limiting");
  }

  /**
   * Main method to analyze conditions and prepare parlay
   */
  async analyzeParlayOpportunity(): Promise<{
    predictions: ParlayPrediction[];
    canTrade: boolean;
    reason: string;
  }> {
    try {
      // Fetch eligible conditions (parlay markets)
      const conditions = await this.fetchParlayMarkets();
      if (conditions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "No eligible conditions available",
        };
      }

      // Generate predictions
      const allPredictions = await this.generateParlayPredictions(conditions);
      if (allPredictions.length === 0) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Failed to generate predictions",
        };
      }

      // Select best legs for parlay
      const selectedPredictions = this.selectParlayLegs(allPredictions);
      if (selectedPredictions.length < 2) {
        return {
          predictions: [],
          canTrade: false,
          reason: "Not enough high-confidence predictions for parlay",
        };
      }

      // Check rate limiting
      const rateCheck = this.canPlaceParlay();
      
      return {
        predictions: selectedPredictions,
        canTrade: rateCheck.allowed,
        reason: rateCheck.reason,
      };
    } catch (error) {
      elizaLogger.error("[ParlayMarket] Error analyzing parlay opportunity:", error);
      return {
        predictions: [],
        canTrade: false,
        reason: `Error: ${error.message}`,
      };
    }
  }
}

export default ParlayMarketService;