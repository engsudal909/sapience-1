import { elizaLogger, IAgentRuntime, ModelType, Memory, HandlerCallback } from "@elizaos/core";
// @ts-ignore - Sapience plugin types not available at build time
import type { SapienceService } from "./sapienceService.js";
import { loadSdk } from "../utils/sdk.js";
import { getWalletAddress } from "../utils/blockchain.js";
import ParlayMarketService from "./parlayMarketService.js";

interface AttestationConfig {
  enabled: boolean;
  interval: number;
  minConfidence: number;
  batchSize: number;
  probabilityChangeThreshold: number;
  minTimeBetweenAttestations: number; // minimum hours between attestations on same market
}

// Global singleton instance
let globalInstance: AttestationService | null = null;

export class AttestationService {
  private runtime!: IAgentRuntime;
  private config!: AttestationConfig;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private parlayService?: ParlayMarketService;

  constructor(runtime: IAgentRuntime) {
    if (globalInstance) {
      return globalInstance;
    }

    this.runtime = runtime;
    this.config = {
      enabled: process.env.ENABLE_AUTONOMOUS_ATTESTATION === "true",
      interval: parseInt(process.env.ATTESTATION_INTERVAL_MS || "300000"),
      minConfidence: parseFloat(process.env.MIN_ATTESTATION_CONFIDENCE || "0.6"),
      batchSize: parseInt(process.env.ATTESTATION_BATCH_SIZE || "5"),
      probabilityChangeThreshold: parseFloat(process.env.PROBABILITY_CHANGE_THRESHOLD || "10"),
      minTimeBetweenAttestations: parseFloat(process.env.MIN_HOURS_BETWEEN_ATTESTATIONS || "24"),
    };

    globalInstance = this;
    
    // Initialize parlay service if parlay trading is enabled
    if (process.env.ENABLE_PARLAY_TRADING === "true") {
      this.parlayService = new ParlayMarketService(runtime);
      elizaLogger.info("[AttestationService] Parlay trading enabled - initialized ParlayMarketService");
    }
    
    this.initializeService().catch((error) => {
      elizaLogger.error("[AttestationService] Failed to initialize:", error);
    });
  }

  static getInstance(runtime?: IAgentRuntime): AttestationService | null {
    if (!globalInstance && runtime) {
      globalInstance = new AttestationService(runtime);
    }
    return globalInstance;
  }

  private async initializeService(): Promise<void> {
    try {
      const settings = (this.runtime?.character?.settings as any)?.autonomousMode;
      if (settings) {
        this.config = { ...this.config, ...settings };
      }

      if (this.config.enabled) {
        await this.waitForSapiencePlugin();
        await this.startAutonomous();
      }
    } catch (error) {
      elizaLogger.error("[AttestationService] Failed to initialize:", error);
    }
  }

  private async waitForSapiencePlugin(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      const sapienceService = this.runtime.getService("sapience") as SapienceService;
      if (sapienceService) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("[AttestationService] Sapience plugin failed to initialize");
  }

  async startAutonomous(): Promise<void> {
    if (this.isRunning) return;

    try {
      console.log(`🤖 Autonomous attestation started (${this.config.interval / 1000}s intervals, ${(this.config.minConfidence * 100).toFixed(0)}% min confidence)`);
      
      this.isRunning = true;
      this.intervalId = setInterval(async () => {
        try {
          await this.attestationCycle();
        } catch (error) {
          elizaLogger.error("[AttestationService] Cycle error:", error);
        }
      }, this.config.interval);

      await this.attestationCycle();
    } catch (error) {
      elizaLogger.error("[AttestationService] Failed to start:", error);
      this.isRunning = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    console.log("🛑 Autonomous attestation stopped");
  }

  private async attestationCycle(): Promise<void> {
    try {
      const sapienceService = this.runtime.getService("sapience") as SapienceService;
      if (!sapienceService) {
        elizaLogger.error("[AttestationService] Sapience service not available");
        return;
      }

      // Fetch active markets
      const marketsResponse = await sapienceService.callTool("sapience", "list_active_markets", {});
      if (!marketsResponse || !marketsResponse.content) {
        elizaLogger.error("[AttestationService] Failed to fetch markets");
        return;
      }

      const markets = JSON.parse(marketsResponse.content?.[0]?.text ?? "[]");
      const candidateMarkets = await this.filterMarketsForAttestation(markets);

      if (candidateMarkets.length > 0) {
        console.log(`📊 Processing ${candidateMarkets.length} eligible markets...`);
        
        const batch = candidateMarkets.slice(0, this.config.batchSize);
        for (const market of batch) {
          try {
            await this.attestToMarket(market);
          } catch (error) {
            elizaLogger.error(`[AttestationService] Failed to process market ${market.id}:`, error);
          }
        }
      }

      // Attempt parlay trading if enabled
      if (this.parlayService && process.env.ENABLE_PARLAY_TRADING === "true") {
        try {
          await this.attemptParlayTrading();
        } catch (error) {
          elizaLogger.error("[AttestationService] Failed parlay trading attempt:", error);
        }
      }
    } catch (error) {
      elizaLogger.error("[AttestationService] Cycle failed:", error);
    }
  }

  private async filterMarketsForAttestation(markets: any[]): Promise<any[]> {
    const candidateMarkets: any[] = [];
    const walletAddress = await this.getWalletAddress();
    if (!walletAddress) return candidateMarkets;

    const allMyAttestations = await this.getAllMyAttestations(walletAddress);

    for (const market of markets) {
      try {
        const marketAddress = market.marketGroupAddress || market.marketAddress;
        const marketId = market.marketId || market.id;

        const matchingAttestation = allMyAttestations.find(
          (att) =>
            att.marketAddress?.toLowerCase() === marketAddress?.toLowerCase() &&
            att.marketId?.toString() === marketId?.toString(),
        );

        if (!matchingAttestation) {
          market._attestationReason = "Never attested";
          candidateMarkets.push(market);
          continue;
        }

        const hoursSince = (Date.now() - new Date(matchingAttestation.createdAt).getTime()) / (1000 * 60 * 60);
        
        if (hoursSince < this.config.minTimeBetweenAttestations) {
          elizaLogger.info(`[AttestationService] Market ${marketId}: Only ${hoursSince.toFixed(1)} hours since last attestation, need ${this.config.minTimeBetweenAttestations} hours`);
          continue;
        }

        const currentPrediction = await this.generatePrediction(market);
        if (currentPrediction && matchingAttestation.prediction) {
          const previousProbability = this.decodeProbability(matchingAttestation.prediction);
          if (previousProbability !== null) {
            const probabilityChange = Math.abs(currentPrediction.probability - previousProbability);
            
            if (probabilityChange >= this.config.probabilityChangeThreshold) {
              market._attestationReason = `Probability changed by ${probabilityChange.toFixed(1)}% (from ${previousProbability.toFixed(0)}% to ${currentPrediction.probability}%)`;
              market._currentPrediction = currentPrediction;
              candidateMarkets.push(market);
            } else {
              elizaLogger.info(`[AttestationService] Market ${marketId}: Probability change ${probabilityChange.toFixed(1)}% below threshold ${this.config.probabilityChangeThreshold}%`);
            }
          }
        }
      } catch (error) {
        elizaLogger.warn(`[AttestationService] Market ${market.id}: Error checking previous attestation - ${error.message}`);
      }
    }

    return candidateMarkets;
  }

  private async generatePrediction(market: any): Promise<{
    probability: number;
    reasoning: string;
    confidence: number;
  } | null> {
    try {
      const predictionPrompt = `Market: ${market.question}
Current Price: ${market.currentPrice || 50}% YES
End Date: ${new Date(market.endTimestamp * 1000).toISOString()}

Analyze this prediction market and respond with ONLY valid JSON:
{
  "probability": <number 0-100>,
  "reasoning": "<analysis under 180 chars, lowercase>",
  "confidence": <number 0.0-1.0>
}`;

      const response = await this.runtime.useModel(ModelType.TEXT_SMALL, { prompt: predictionPrompt });
      
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

      if (!prediction.probability || !prediction.reasoning || !prediction.confidence) {
        throw new Error("Incomplete prediction data");
      }

      return prediction;
    } catch (error) {
      elizaLogger.error(`[AttestationService] Failed to generate prediction for market ${market.id}:`, error);
      return null;
    }
  }

  private async getWalletAddress(): Promise<string | null> {
    try {
      return getWalletAddress();
    } catch (error) {
      elizaLogger.error("[AttestationService] Failed to get wallet address:", error);
      return null;
    }
  }

  private async getAllMyAttestations(walletAddress: string): Promise<any[]> {
    try {
      const sapienceService = this.runtime.getService("sapience") as SapienceService;
      const result = await sapienceService.callTool("sapience", "get_attestations_by_address", {
        attesterAddress: walletAddress,
      });

      if (result?.content) {
        const attestations = JSON.parse(result.content?.[0]?.text ?? "[]");
        return attestations.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      return [];
    } catch (error) {
      elizaLogger.error(`[AttestationService] Failed to get attestations for ${walletAddress}:`, error);
      return [];
    }
  }

  private decodeProbability(predictionValue: string): number | null {
    try {
      const predictionBigInt = BigInt(predictionValue);
      const Q96 = BigInt("79228162514264337593543950336");
      const sqrtPrice = Number((predictionBigInt * BigInt(10 ** 18)) / Q96) / 10 ** 18;
      const probability = (sqrtPrice * sqrtPrice) * 100;
      return Math.max(0, Math.min(100, probability));
    } catch (error) {
      elizaLogger.warn(`[AttestationService] Failed to decode probability ${predictionValue}:`, error);
      return null;
    }
  }


  private async attestToMarket(market: any): Promise<void> {
    try {
      const marketId = market.marketId || market.id;
      console.log(`🔍 Analyzing market #${marketId}: ${market.question?.substring(0, 60)}...`);

      const prediction = market._currentPrediction || await this.generatePrediction(market);
      if (!prediction) return;

      if (prediction.confidence < this.config.minConfidence) {
        console.log(`⏭️  Skipping: confidence ${prediction.confidence} below threshold`);
        return;
      }

      console.log(`📊 Prediction: ${prediction.probability}% YES (confidence: ${prediction.confidence})`);

      const { buildAttestationCalldata } = await loadSdk();
      const attestationData = await buildAttestationCalldata(
        {
          marketId: parseInt(marketId),
          address: market.marketGroupAddress || market.contractAddress || "0x0000000000000000000000000000000000000000",
          question: market.question,
        },
        prediction,
        42161,
      );

      if (attestationData) {
        const submitAction = this.runtime.actions?.find((a) => a.name === "SUBMIT_TRANSACTION");
        if (submitAction) {
          const transactionMessage: Memory = {
            entityId: "00000000-0000-0000-0000-000000000000" as any,
            agentId: this.runtime.agentId,
            roomId: "00000000-0000-0000-0000-000000000000" as any,
            content: {
              text: `Submit this transaction: ${JSON.stringify({
                to: attestationData.to,
                data: attestationData.data,
                value: attestationData.value || "0",
              })}`,
              action: "SUBMIT_TRANSACTION",
            },
            createdAt: Date.now(),
          };

          await submitAction.handler(this.runtime, transactionMessage, undefined, {}, undefined);
        }
      }

      if (process.env.ENABLE_SPOT_TRADING === "true") {
        await this.attemptSpotTrading(market, prediction);
      }

      console.log(`✅ Attested: ${prediction.probability}% YES - ${prediction.reasoning.substring(0, 80)}${prediction.reasoning.length > 80 ? "..." : ""}`);
    } catch (error) {
      elizaLogger.error(`[AttestationService] Failed to process market ${market.id}:`, error);
    }
  }

  private async attemptSpotTrading(market: any, prediction: any): Promise<void> {
    try {
      const tradingAction = this.runtime.actions?.find((a) => a.name === "SPOT_TRADING");
      if (!tradingAction) return;

      const tradingMessage: Memory = {
        entityId: "00000000-0000-0000-0000-000000000000" as any,
        agentId: this.runtime.agentId,
        roomId: "00000000-0000-0000-0000-000000000000" as any,
        content: {
          text: `Execute spot trade: ${JSON.stringify({ market, prediction })}`,
          action: "SPOT_TRADING",
        },
        createdAt: Date.now(),
      };

      const tradingCallback: HandlerCallback = async (response: any) => {
        if (response.content?.success) {
          console.log(`💰 Spot trade: ${prediction.probability > 50 ? 'YES' : 'NO'} (TX: ${response.content.txHash})`);
        }
        return [];
      };

      await tradingAction.handler(this.runtime, tradingMessage, undefined, {}, tradingCallback);
    } catch (error) {
      elizaLogger.error("[AttestationService] Spot trading failed:", error);
    }
  }

  private async attemptParlayTrading(): Promise<void> {
    try {
      if (!this.parlayService) return;

      console.log("🎯 Analyzing parlay opportunities...");

      // Analyze parlay opportunity
      const analysis = await this.parlayService.analyzeParlayOpportunity();

      if (!analysis.canTrade) {
        elizaLogger.info(`[AttestationService] Parlay trading skipped: ${analysis.reason}`);
        return;
      }

      if (analysis.predictions.length < 2) {
        elizaLogger.info("[AttestationService] Not enough high-confidence predictions for parlay");
        return;
      }

      console.log(`🎯 Found ${analysis.predictions.length}-leg parlay opportunity! Executing trade...`);

      // Find and execute parlay trading action
      const parlayAction = this.runtime.actions?.find((a) => a.name === "PARLAY_TRADING");
      if (!parlayAction) {
        elizaLogger.error("[AttestationService] PARLAY_TRADING action not found");
        return;
      }

      const parlayData = {
        markets: analysis.predictions.map(p => p.market),
        predictions: analysis.predictions.map(p => ({
          probability: p.probability,
          reasoning: `Predicted ${p.outcome ? 'YES' : 'NO'} with ${p.confidence * 100}% confidence`,
          confidence: p.confidence,
          market: p.market.question
        }))
      };

      const parlayMessage: Memory = {
        entityId: "00000000-0000-0000-0000-000000000000" as any,
        agentId: this.runtime.agentId,
        roomId: "00000000-0000-0000-0000-000000000000" as any,
        content: {
          text: `Execute autonomous parlay trading ${JSON.stringify(parlayData)}`,
          action: "PARLAY_TRADING",
        },
        createdAt: Date.now(),
      };

      const parlayCallback: HandlerCallback = async (response: any) => {
        if (response.content?.success) {
          console.log(`🎯 Parlay executed successfully: ${response.content.txHash}`);
          console.log(`   Legs: ${response.content.legs?.length || 0}`);
        } else {
          console.log(`❌ Parlay failed: ${response.content?.error || 'Unknown error'}`);
        }
        return [];
      };

      await parlayAction.handler(this.runtime, parlayMessage, undefined, {}, parlayCallback);
    } catch (error) {
      elizaLogger.error("[AttestationService] Parlay trading failed:", error);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      interval: this.config.interval,
      minConfidence: this.config.minConfidence,
      batchSize: this.config.batchSize,
    };
  }
}
