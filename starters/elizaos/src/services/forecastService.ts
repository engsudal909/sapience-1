import { elizaLogger, IAgentRuntime, ModelType, Memory, HandlerCallback } from "@elizaos/core";
// @ts-ignore - Sapience plugin types not available at build time
import type { SapienceService } from "./sapienceService.js";
import { loadSdk } from "../utils/sdk.js";
import { getWalletAddress, hasPrivateKey } from "../utils/blockchain.js";
import TradingMarketService from "./tradingMarketService.js";
import { MarketMakerService } from "./marketMakerService.js";

type AutonomousMode = "forecast" | "trade" | "marketmaker";

interface ServiceConfig {
  modes: AutonomousMode[];
  interval: number;
  minConfidence: number;
  batchSize: number;
  probabilityChangeThreshold: number;
  minTimeBetweenForecasts: number;
}

// Global singleton instance
let globalInstance: ForecastService | null = null;

/**
 * Parse AUTONOMOUS_MODE env var into array of modes
 * e.g., "forecast" -> ["forecast"]
 *       "forecast,trade" -> ["forecast", "trade"]
 */
function parseAutonomousModes(): AutonomousMode[] {
  const envValue = process.env.AUTONOMOUS_MODE || "";
  const modes: AutonomousMode[] = [];
  
  for (const part of envValue.split(",")) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed === "forecast" || trimmed === "trade" || trimmed === "marketmaker") {
      modes.push(trimmed);
    }
  }
  
  return modes;
}

export class ForecastService {
  private runtime!: IAgentRuntime;
  private config!: ServiceConfig;
  private forecastIntervalId?: NodeJS.Timeout;
  private tradeIntervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private tradingService?: TradingMarketService;
  private marketMakerService?: MarketMakerService;

  constructor(runtime: IAgentRuntime) {
    if (globalInstance) {
      return globalInstance;
    }

    this.runtime = runtime;
    this.config = {
      modes: parseAutonomousModes(),
      interval: parseInt(process.env.FORECAST_INTERVAL_MS || process.env.ATTESTATION_INTERVAL_MS || "300000"),
      minConfidence: parseFloat(process.env.MIN_FORECAST_CONFIDENCE || process.env.MIN_ATTESTATION_CONFIDENCE || "0.6"),
      batchSize: parseInt(process.env.FORECAST_BATCH_SIZE || process.env.ATTESTATION_BATCH_SIZE || "5"),
      probabilityChangeThreshold: parseFloat(process.env.PROBABILITY_CHANGE_THRESHOLD || "10"),
      minTimeBetweenForecasts: parseFloat(process.env.MIN_HOURS_BETWEEN_FORECASTS || process.env.MIN_HOURS_BETWEEN_ATTESTATIONS || "24"),
    };

    globalInstance = this;
    
    // Initialize trading service if trade mode is enabled
    if (this.config.modes.includes("trade")) {
      this.tradingService = new TradingMarketService(runtime);
      elizaLogger.info("[ForecastService] Trade mode enabled - initialized TradingMarketService");
    }
    
    // Initialize Market Maker service if enabled
    if (process.env.MARKET_MAKER_ENABLED === "true") {
      this.marketMakerService = new MarketMakerService(runtime);
      elizaLogger.info("[ForecastService] Market Maker mode enabled - initialized MarketMakerService");
    }
    
    this.initializeService().catch((error) => {
      elizaLogger.error("[ForecastService] Failed to initialize:", error);
    });
  }

  static getInstance(runtime?: IAgentRuntime): ForecastService | null {
    if (!globalInstance && runtime) {
      globalInstance = new ForecastService(runtime);
    }
    return globalInstance;
  }

  private async initializeService(): Promise<void> {
    try {
      // Auto-start if any autonomous mode is configured
      if (this.config.modes.length > 0) {
        await this.waitForSapiencePlugin();
        await this.startAutonomous();
      }
    } catch (error) {
      elizaLogger.error("[ForecastService] Failed to initialize:", error);
    }
  }

  private async waitForSapiencePlugin(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      const sapienceService = this.runtime.getService("sapience") as SapienceService;
      if (sapienceService) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("[ForecastService] Sapience plugin failed to initialize");
  }

  async startAutonomous(): Promise<void> {
    if (this.isRunning) return;

    try {
      const modesStr = this.config.modes.join(", ") || "none";
      const forecastInterval = parseInt(process.env.FORECAST_INTERVAL_MS || process.env.ATTESTATION_INTERVAL_MS || "43200000"); // Default 12 hours (was 24h)
      const tradeInterval = parseInt(process.env.TRADING_INTERVAL_MS || "3600000"); // Default 1 hour (was 30 min)
      
      console.log(`🤖 Autonomous mode started (${modesStr})`);
      if (this.config.modes.includes("forecast")) {
        console.log(`  - Forecast: ${forecastInterval / 1000}s intervals`);
      }
      if (this.config.modes.includes("trade")) {
        console.log(`  - Trading: ${tradeInterval / 1000}s intervals`);
      }
      
      this.isRunning = true;
      
      // Start Forecast cycle with its own interval
      if (this.config.modes.includes("forecast")) {
        this.forecastIntervalId = setInterval(async () => {
          try {
            await this.forecastCycle();
          } catch (error) {
            elizaLogger.error("[ForecastService] Forecast cycle error:", error);
          }
        }, forecastInterval);
        // Run immediately
        await this.forecastCycle();
      }
      
      // Start Trading cycle with its own interval
      if (this.config.modes.includes("trade")) {
        this.tradeIntervalId = setInterval(async () => {
          try {
            await this.tradeCycle();
          } catch (error) {
            elizaLogger.error("[ForecastService] Trade cycle error:", error);
          }
        }, tradeInterval);
        // Run immediately
        await this.tradeCycle();
      }
    } catch (error) {
      elizaLogger.error("[ForecastService] Failed to start:", error);
      this.isRunning = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.forecastIntervalId) {
      clearInterval(this.forecastIntervalId);
      this.forecastIntervalId = undefined;
    }
    if (this.tradeIntervalId) {
      clearInterval(this.tradeIntervalId);
      this.tradeIntervalId = undefined;
    }

    this.isRunning = false;
    console.log("🛑 Autonomous mode stopped");
  }

  /**
   * Run whichever cycles are enabled by AUTONOMOUS_MODE
   * Note: This method is kept for backward compatibility but cycles now run on separate intervals
   */
  private async runCycle(): Promise<void> {
    if (this.config.modes.includes("forecast")) {
      await this.forecastCycle();
    }
    if (this.config.modes.includes("trade")) {
      await this.tradeCycle();
    }
  }

  // ============================================================================
  // Public methods for manual triggering (via chat commands)
  // ============================================================================

  /**
   * Result type for forecast cycle
   */
  public static readonly ForecastResult = class {
    marketsAnalyzed: number = 0;
    forecastsSubmitted: number = 0;
    predictions: Array<{ market: string; probability: number; confidence: number; reasoning: string }> = [];
  };

  /**
   * Result type for trade cycle
   */
  public static readonly TradeResult = class {
    marketsAnalyzed: number = 0;
    opportunitiesFound: number = 0;
    tradesExecuted: number = 0;
    predictions: Array<{ market: string; probability: number; confidence: number; outcome: boolean }> = [];
    reason?: string;
  };

  /**
   * Run a single forecast cycle on demand
   */
  async runForecast(): Promise<{
    marketsAnalyzed: number;
    forecastsSubmitted: number;
    predictions: Array<{ market: string; probability: number; confidence: number; reasoning: string }>;
    submissionsEnabled: boolean;
  }> {
    console.log("🔍 Running forecast cycle...");
    const result = await this.forecastCycleWithResults();
    console.log("✅ Forecast cycle complete");
    return result;
  }

  /**
   * Run a single trade cycle on demand
   */
  async runTrade(): Promise<{
    marketsAnalyzed: number;
    opportunitiesFound: number;
    tradesExecuted: number;
    predictions: Array<{ market: string; probability: number; confidence: number; outcome: boolean }>;
    reason?: string;
  }> {
    // Ensure trading service is initialized
    if (!this.tradingService) {
      this.tradingService = new TradingMarketService(this.runtime);
    }
    console.log("🎯 Running trade cycle...");
    const result = await this.tradeCycleWithResults();
    console.log("✅ Trade cycle complete");
    return result;
  }

  // ============================================================================
  // Forecast cycle - generate predictions and submit forecasts
  // ============================================================================

  private async forecastCycle(): Promise<void> {
    await this.forecastCycleWithResults();
  }

  private async forecastCycleWithResults(): Promise<{
    marketsAnalyzed: number;
    forecastsSubmitted: number;
    predictions: Array<{ market: string; probability: number; confidence: number; reasoning: string }>;
    submissionsEnabled: boolean;
  }> {
    const submissionsEnabled = hasPrivateKey();
    const result = {
      marketsAnalyzed: 0,
      forecastsSubmitted: 0,
      predictions: [] as Array<{ market: string; probability: number; confidence: number; reasoning: string }>,
      submissionsEnabled,
    };

    try {
      const sapienceService = this.runtime.getService("sapience") as SapienceService;
      if (!sapienceService) {
        elizaLogger.error("[ForecastService] Sapience service not available");
        return result;
      }

      const walletAddress = await this.getWalletAddress();
      const allMyForecasts = walletAddress
        ? await this.getAllMyForecasts(walletAddress)
        : [];

      // Fetch conditions - always initialize trading service for fetching markets
      if (!this.tradingService) {
        this.tradingService = new TradingMarketService(this.runtime);
      }
      const allConditions = await this.tradingService.fetchTradingMarkets();
      
      // Filter for Forecast: only markets within 48 hours (MAX_MARKET_HOURS)
      const now = Math.floor(Date.now() / 1000);
      const maxMarketHours = parseInt(process.env.MAX_MARKET_HOURS || "48"); // Forecast uses 48h
      const maxEndTime = now + (maxMarketHours * 60 * 60);
      
      const conditions = allConditions.filter((condition: any) => {
        return condition.endTime && condition.endTime <= maxEndTime;
      });
      
      elizaLogger.info(`[Forecast] Filtered ${conditions.length} conditions within ${maxMarketHours}h from ${allConditions.length} total markets`);
      result.marketsAnalyzed = conditions.length;

      const candidateConditions: any[] = [];
      for (const condition of conditions) {
        try {
          const matchingForecast = allMyForecasts.find(
            (att) =>
              (att.questionId?.toLowerCase?.() || "") ===
              (condition.id?.toLowerCase?.() || "")
          );

          if (!matchingForecast) {
            condition._forecastReason = "Never forecasted";
            candidateConditions.push(condition);
            continue;
          }

          const hoursSince =
            (Date.now() - new Date(matchingForecast.createdAt).getTime()) /
            (1000 * 60 * 60);
          if (hoursSince < this.config.minTimeBetweenForecasts) {
            elizaLogger.info(
              `[Forecast] Condition ${condition.id}: Only ${hoursSince.toFixed(1)}h since last forecast`
            );
            continue;
          }

          const currentPrediction = await this.generateConditionPrediction(condition);
          if (currentPrediction && matchingForecast.prediction) {
            const previousProbability = this.decodeProbability(matchingForecast.prediction);
            if (previousProbability !== null) {
              const probabilityChange = Math.abs(
                currentPrediction.probability - previousProbability
              );
              if (probabilityChange >= this.config.probabilityChangeThreshold) {
                condition._forecastReason = `Probability changed by ${probabilityChange.toFixed(1)}%`;
                condition._currentPrediction = currentPrediction;
                candidateConditions.push(condition);
              }
            }
          }
        } catch (error) {
          elizaLogger.warn(
            `[Forecast] Condition ${condition.id}: Error - ${error.message}`
          );
        }
      }

      if (candidateConditions.length > 0) {
        console.log(`📊 Forecasting ${candidateConditions.length} conditions...`);
        const batch = candidateConditions.slice(0, this.config.batchSize);
        for (const condition of batch) {
          try {
            const forecastResult = await this.submitForecast(condition);
            if (forecastResult) {
              result.forecastsSubmitted++;
              result.predictions.push({
                market: condition.question || condition.id,
                probability: forecastResult.probability,
                confidence: forecastResult.confidence,
                reasoning: forecastResult.reasoning,
              });
            }
          } catch (error) {
            elizaLogger.error(`[Forecast] Failed: ${condition.id}`, error);
          }
        }
      } else {
        console.log("📊 No conditions need forecasting right now");
      }
    } catch (error) {
      elizaLogger.error("[Forecast] Cycle failed:", error);
    }

    return result;
  }

  // ============================================================================
  // Trade cycle - analyze trading opportunities and execute trades
  // ============================================================================

  private async tradeCycle(): Promise<void> {
    // Call TRADE action directly to display results in UI
    // This ensures automatic trading cycles show results in the UI just like manual "trade markets" command
    try {
      const tradeAction = this.runtime.actions?.find((a) => a.name === "TRADE");
      if (!tradeAction) {
        elizaLogger.error("[ForecastService] TRADE action not found");
        return;
      }

      // Create a dummy message for the action handler
      const tradeMessage: Memory = {
        entityId: "00000000-0000-0000-0000-000000000000" as any,
        agentId: this.runtime.agentId,
        roomId: "00000000-0000-0000-0000-000000000000" as any,
        content: {
          text: "Autonomous trading cycle",
          action: "TRADE",
        },
        createdAt: Date.now(),
      };

      // Call TRADE action handler - it will display results in UI via its callback
      // For autonomous execution, we don't provide a callback - the action handles it internally
      await tradeAction.handler(
        this.runtime,
        tradeMessage,
        undefined,
        {},
        undefined // No callback needed - TRADE action handles UI display internally
      );
    } catch (error) {
      elizaLogger.error("[ForecastService] Trade cycle error:", error);
    }
  }

  private async tradeCycleWithResults(): Promise<{
    marketsAnalyzed: number;
    opportunitiesFound: number;
    tradesExecuted: number;
    predictions: Array<{ market: string; probability: number; confidence: number; outcome: boolean }>;
    reason?: string;
  }> {
    const result = {
      marketsAnalyzed: 0,
      opportunitiesFound: 0,
      tradesExecuted: 0,
      predictions: [] as Array<{ market: string; probability: number; confidence: number; outcome: boolean }>,
      reason: undefined as string | undefined,
    };

    try {
      if (!this.tradingService) {
        elizaLogger.error("[Trade] Trading service not available");
        result.reason = "Trading service not available";
        return result;
      }

      console.log("🎯 Analyzing trading opportunities...");

      const analysis = await this.tradingService.analyzeTradingOpportunity();
      result.marketsAnalyzed = analysis.marketsAnalyzed;

      if (!analysis.canTrade) {
        elizaLogger.info(`[Trade] Skipped: ${analysis.reason}`);
        result.reason = analysis.reason;
        return result;
      }

      if (analysis.predictions.length < 1) {
        elizaLogger.info("[Trade] Not enough high-confidence predictions for trade");
        result.reason = "Not enough high-confidence predictions (need at least 1)";
        return result;
      }

      result.opportunitiesFound = analysis.predictions.length;
      result.predictions = analysis.predictions.map(p => ({
        market: p.market.question || p.marketId,
        probability: p.probability,
        confidence: p.confidence,
        outcome: p.outcome,
      }));

      console.log(`🎯 Found ${analysis.predictions.length}-leg trading opportunity!`);

      const tradingAction = this.runtime.actions?.find((a) => a.name === "TRADING");
      if (!tradingAction) {
        elizaLogger.error("[Trade] TRADING action not found");
        result.reason = "TRADING action not found";
        return result;
      }

      const tradeData = {
        markets: analysis.predictions.map(p => p.market),
        predictions: analysis.predictions.map(p => ({
          probability: p.probability,
          reasoning: `Predicted ${p.outcome ? 'YES' : 'NO'} with ${p.confidence * 100}% confidence`,
          confidence: p.confidence,
          market: p.market.question
        }))
      };

      const tradeMessage: Memory = {
        entityId: "00000000-0000-0000-0000-000000000000" as any,
        agentId: this.runtime.agentId,
        roomId: "00000000-0000-0000-0000-000000000000" as any,
        content: {
          text: `Execute trade ${JSON.stringify(tradeData)}`,
          action: "TRADING",
        },
        createdAt: Date.now(),
      };

      let tradeSuccess = false;
      const tradeCallback: HandlerCallback = async (response: any) => {
        if (response.content?.success) {
          console.log(`🎯 Trade executed: ${response.content.txHash}`);
          tradeSuccess = true;
        } else {
          console.log(`❌ Trade failed: ${response.content?.error || 'Unknown error'}`);
          result.reason = response.content?.error || 'Trade execution failed';
        }
        return [];
      };

      await tradingAction.handler(this.runtime, tradeMessage, undefined, {}, tradeCallback);
      
      if (tradeSuccess) {
        result.tradesExecuted = 1;
      }
      
      // Display results in ElizaOS UI (console.log will show in PM2 logs and can be viewed in UI)
      const resultMessage = this.buildTradingResultMessage(result);
      console.log("\n" + "=".repeat(60));
      console.log(resultMessage);
      console.log("=".repeat(60) + "\n");
    } catch (error) {
      elizaLogger.error("[Trade] Cycle failed:", error);
      result.reason = error.message;
      
      // Display error in UI too
      const errorMessage = `**Trading Cycle Failed**\n\n${result.reason || error.message}`;
      console.log(errorMessage);
    }

    return result;
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private buildTradingResultMessage(result: {
    marketsAnalyzed: number;
    opportunitiesFound: number;
    tradesExecuted: number;
    predictions: Array<{ market: string; probability: number; confidence: number; outcome: boolean }>;
    reason?: string;
  }): string {
    if (result.tradesExecuted > 0) {
      const predictionsSummary = result.predictions
        .map(p => `• ${p.market}: ${p.outcome ? 'YES' : 'NO'} @ ${p.probability}% (Confidence: ${(p.confidence * 100).toFixed(0)}%)`)
        .join('\n');
      
      return `**Trading Complete** ✅

Markets Analyzed: ${result.marketsAnalyzed}
Opportunities Found: ${result.opportunitiesFound}
Trades Executed: ${result.tradesExecuted}

**Predictions Used:**
${predictionsSummary}`;
    } else if (result.opportunitiesFound > 0) {
      const predictionsSummary = result.predictions
        .map(p => `• ${p.market}: ${p.outcome ? 'YES' : 'NO'} @ ${p.probability}%`)
        .join('\n');
      
      return `**Trading Complete** ⏳

Markets Analyzed: ${result.marketsAnalyzed}
Opportunities Found: ${result.opportunitiesFound}
Trades Executed: 0

**Opportunities Found:**
${predictionsSummary}

${result.reason ? `*Note: ${result.reason}*` : ''}`;
    } else {
      return `**Trading Complete** ❌

Markets Analyzed: ${result.marketsAnalyzed}
Opportunities Found: 0
Trades Executed: 0

${result.reason || 'No high-confidence trading opportunities found at this time.'}`;
    }
  }

  private async generateConditionPrediction(condition: any): Promise<{
    probability: number;
    reasoning: string;
    confidence: number;
  } | null> {
    try {
      const endDate = condition.endTime
        ? new Date(condition.endTime * 1000).toISOString()
        : "Unknown";
      const now = new Date();
      const hoursUntilEnd = condition.endTime ? Math.round((condition.endTime * 1000 - now.getTime()) / (1000 * 60 * 60)) : 0;
      
      const predictionPrompt = `PREDICTION MARKET ANALYSIS

CURRENT TIME: ${now.toISOString()}
MARKET END: ${endDate}
HOURS REMAINING: ${hoursUntilEnd} hours

Question: ${condition.question}

This market resolves in ${hoursUntilEnd} hours. Analyze using available data and provide your prediction.

Respond with ONLY valid JSON:
{
  "probability": <number 0-100>,
  "reasoning": "<analysis under 180 chars>",
  "confidence": <number 0.5-1.0>
}`;
      const response = await this.runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: predictionPrompt,
      });
      let prediction;
      try {
        prediction = JSON.parse(response);
      } catch {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          prediction = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Invalid JSON response");
        }
      }
      if (
        prediction.probability === undefined ||
        !prediction.reasoning ||
        prediction.confidence === undefined
      ) {
        throw new Error("Incomplete prediction data");
      }
      return prediction;
    } catch (error) {
      elizaLogger.error(`[Forecast] Failed to generate prediction: ${condition.id}`, error);
      return null;
    }
  }

  private async submitForecast(condition: any): Promise<{
    probability: number;
    confidence: number;
    reasoning: string;
  } | null> {
    try {
      const prediction =
        condition._currentPrediction ||
        (await this.generateConditionPrediction(condition));
      if (!prediction) return null;

      if (prediction.confidence < this.config.minConfidence) {
        console.log(`⏭️  Skipping: confidence ${prediction.confidence} below threshold`);
        return null;
      }

      console.log(`📊 Prediction: ${prediction.probability}% YES (confidence: ${prediction.confidence})`);

      // Check if we can actually submit (private key available)
      if (!hasPrivateKey()) {
        console.log(`📝 Prediction generated (no private key - not submitted on-chain)`);
        return {
          probability: prediction.probability,
          confidence: prediction.confidence,
          reasoning: prediction.reasoning,
        };
      }

      const { buildForecastCalldata, getDefaultResolver } = await loadSdk();

      // Use the default UMA resolver for Arbitrum
      const resolver = getDefaultResolver?.() || "0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9";

      const calldata = buildForecastCalldata(
        resolver as `0x${string}`,
        condition.id as `0x${string}`,
        prediction.probability,
        prediction.reasoning
      );

      const submitAction = this.runtime.actions?.find(
        (a) => a.name === "SUBMIT_TRANSACTION"
      );
      if (submitAction) {
        const transactionMessage: Memory = {
          entityId: "00000000-0000-0000-0000-000000000000" as any,
          agentId: this.runtime.agentId,
          roomId: "00000000-0000-0000-0000-000000000000" as any,
          content: {
            text: `Submit this transaction: ${JSON.stringify({
              to: calldata.to,
              data: calldata.data,
              value: calldata.value,
            })}`,
            action: "SUBMIT_TRANSACTION",
          },
          createdAt: Date.now(),
        };
        await submitAction.handler(
          this.runtime,
          transactionMessage,
          undefined,
          {},
          undefined
        );
      }

      console.log(
        `✅ Forecast submitted: ${prediction.probability}% YES - ${prediction.reasoning.substring(0, 80)}${prediction.reasoning.length > 80 ? "..." : ""}`
      );

      return {
        probability: prediction.probability,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
      };
    } catch (error) {
      elizaLogger.error(`[Forecast] Failed to submit: ${condition.id}`, error);
      return null;
    }
  }

  private async getWalletAddress(): Promise<string | null> {
    try {
      return getWalletAddress();
    } catch (error) {
      elizaLogger.error("[ForecastService] Failed to get wallet address:", error);
      return null;
    }
  }

  private async getAllMyForecasts(walletAddress: string): Promise<any[]> {
    try {
      const sapienceService = this.runtime.getService("sapience") as SapienceService;
      const result = await sapienceService.callTool("sapience", "get_attestations_by_address", {
        attesterAddress: walletAddress,
      });

      if (result?.content) {
        const forecasts = JSON.parse(result.content?.[0]?.text ?? "[]");
        return forecasts.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      return [];
    } catch (error) {
      elizaLogger.error(`[ForecastService] Failed to get forecasts for ${walletAddress}:`, error);
      return [];
    }
  }

  private decodeProbability(predictionValue: string): number | null {
    try {
      // D18 format: probability * 10^18
      const forecastBigInt = BigInt(predictionValue);
      const probability = Number(forecastBigInt) / 1e18;
      return Math.max(0, Math.min(100, probability));
    } catch (error) {
      elizaLogger.warn(`[ForecastService] Failed to decode probability ${predictionValue}:`, error);
      return null;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      modes: this.config.modes,
      interval: this.config.interval,
      minConfidence: this.config.minConfidence,
      batchSize: this.config.batchSize,
    };
  }
}

