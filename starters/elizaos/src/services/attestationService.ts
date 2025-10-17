import { elizaLogger, IAgentRuntime, ModelType, Memory, HandlerCallback } from "@elizaos/core";
// @ts-ignore - Sapience plugin types not available at build time
import type { SapienceService } from "./sapienceService.js";
import { loadSdk } from "../utils/sdk.js";
import { privateKeyToAddress } from "viem/accounts";

interface AttestationConfig {
  enabled: boolean;
  interval: number;
  minConfidence: number;
  batchSize: number;
  probabilityChangeThreshold: number; // Minimum % change to re-attest
}

interface AttestationHistory {
  timestamp: Date;
  probability: number;
  confidence: number;
}

// Global singleton instance
let globalInstance: AttestationService | null = null;

// Standalone service class that doesn't extend Service to avoid initialization issues
export class AttestationService {
  private runtime!: IAgentRuntime;
  private config!: AttestationConfig;
  private intervalId?: NodeJS.Timeout;
  private attestationHistory: Map<string, AttestationHistory> = new Map(); // marketId -> attestation details
  private isRunning: boolean = false;

  constructor(runtime: IAgentRuntime) {
    // Return existing instance if it exists (singleton pattern)
    if (globalInstance) {
      return globalInstance;
    }

    this.runtime = runtime;
    this.config = {
      enabled: false,
      interval: 300000, // 5 minutes
      minConfidence: 0.6,
      batchSize: 5,
      probabilityChangeThreshold: parseFloat(
        process.env.PROBABILITY_CHANGE_THRESHOLD || "0.1",
      ), // Default 0.1% change for testing
    };

    // Store global instance
    globalInstance = this;

    // Initialize service asynchronously
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
      elizaLogger.info("[AttestationService] Initializing attestation service");

      // Load config from environment or character settings
      const settings = (this.runtime?.character?.settings as any)
        ?.autonomousMode;
      if (settings) {
        this.config = { ...this.config, ...settings };
        elizaLogger.info("[AttestationService] Config loaded");
      }

      // Wait for Sapience plugin to be available before starting
      if (this.config.enabled) {
        elizaLogger.info(
          "[AttestationService] Waiting for Sapience plugin to initialize...",
        );
        await this.waitForSapiencePlugin();
        await this.startAutonomous();
      }
    } catch (error) {
      elizaLogger.error("[AttestationService] Failed to initialize:", error);
    }
  }

  private async waitForSapiencePlugin(
    maxRetries: number = 30,
    retryDelay: number = 1000,
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      const sapienceService = this.runtime.getService(
        "sapience",
      ) as SapienceService;
      if (sapienceService) {
        elizaLogger.info("[AttestationService] Sapience plugin is available");
        return;
      }

      if (i === 0) {
        elizaLogger.info(
          "[AttestationService] Sapience plugin not ready, waiting...",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    throw new Error(
      "[AttestationService] Sapience plugin failed to initialize after waiting",
    );
  }

  async startAutonomous(): Promise<void> {
    if (this.isRunning) {
      elizaLogger.warn("[AttestationService] Service already running");
      return;
    }

    try {
      elizaLogger.info(
        `[AttestationService] Starting (interval: ${this.config.interval}ms)`,
      );
      console.log(`\nautonomous attestation started:`);
      console.log(`   • interval: ${this.config.interval / 1000} seconds`);
      console.log(
        `   • min confidence: ${(this.config.minConfidence * 100).toFixed(0)}%`,
      );
      console.log(
        `   • batch size: ${this.config.batchSize} markets per cycle\n`,
      );

      this.isRunning = true;

      // Start the autonomous loop
      this.intervalId = setInterval(async () => {
        try {
          await this.attestationCycle();
        } catch (error) {
          elizaLogger.error("[AttestationService] Cycle error:", error);
        }
      }, this.config.interval);

      // Run initial cycle immediately
      await this.attestationCycle();
    } catch (error) {
      elizaLogger.error("[AttestationService] Failed to start:", error);
      this.isRunning = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      elizaLogger.warn("[AttestationService] Service not running");
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
    elizaLogger.info("[AttestationService] Stopped");
    console.log("autonomous attestation stopped\n");
  }

  private async attestationCycle(): Promise<void> {
    elizaLogger.info("[AttestationService] Starting attestation cycle");

    try {
      const sapienceService = this.runtime.getService(
        "sapience",
      ) as SapienceService;
      if (!sapienceService) {
        elizaLogger.error(
          "[AttestationService] Sapience service not available - will retry next cycle",
        );
        return;
      }

      // First, let's get the wallet address and test attestation retrieval
      await this.testAttestationRetrieval(sapienceService);

      // Fetch active markets
      const marketsResponse = await sapienceService.callTool(
        "sapience",
        "list_active_markets",
        {},
      );

      if (!marketsResponse || !marketsResponse.content) {
        elizaLogger.error("[AttestationService] Failed to fetch markets");
        return;
      }

      const marketsText = marketsResponse.content?.[0]?.text ?? "[]";
      const markets = JSON.parse(marketsText);
      elizaLogger.info(
        `[AttestationService] Found ${markets.length} active markets`,
      );

      // Filter markets for attestation based on time and probability changes
      const candidateMarkets = await this.filterMarketsForAttestation(markets);

      elizaLogger.info(
        `[AttestationService] ${candidateMarkets.length} markets eligible for attestation`,
      );

      console.log(
        "📊 Markets eligible for attestation:",
        candidateMarkets.slice(0, 3).map((m: any) => ({
          id: m.id,
          question: m.question?.substring(0, 50) + "...",
          reason: m._attestationReason,
        })),
      );

      // Process markets in batches
      const batch = candidateMarkets.slice(0, this.config.batchSize);

      for (const market of batch) {
        try {
          await this.attestToMarket(market);
        } catch (error) {
          const marketId = market.marketId || market.id;
          elizaLogger.error(
            `[AttestationService] Failed to process market ${market.id} (marketId: ${marketId}):`,
            error,
          );
        }
      }

      elizaLogger.info(
        "[AttestationService] Attestation cycle completed (retrieval test only)",
      );
    } catch (error) {
      elizaLogger.error("[AttestationService] Cycle failed:", error);
    }
  }

  private async filterMarketsForAttestation(markets: any[]): Promise<any[]> {
    const candidateMarkets: any[] = [];

    // Get our wallet address to query attestations
    const walletAddress = await this.getWalletAddress();
    if (!walletAddress) {
      elizaLogger.error(
        "[AttestationService] Could not determine wallet address",
      );
      return candidateMarkets;
    }

    console.log(
      `[AttestationService] Filtering ${markets.length} markets using wallet address: ${walletAddress}`,
    );

    // Get ALL attestations by our wallet address once
    console.log(
      `[AttestationService] Fetching all attestations for wallet: ${walletAddress}`,
    );
    const allMyAttestations = await this.getAllMyAttestations(walletAddress);
    console.log(
      `[AttestationService] Found ${allMyAttestations.length} total attestations by this wallet`,
    );

    for (const market of markets) {
      try {
        // Use marketAddress + marketId combination to uniquely identify markets
        const marketAddress = market.marketGroupAddress || market.marketAddress;
        const marketId = market.marketId || market.id;

        console.log(
          `[AttestationService] Checking market: id=${market.id}, marketId=${marketId}, address=${marketAddress?.substring(0, 8)}..., question="${market.question?.substring(0, 40)}..."`,
        );

        // Find attestation matching BOTH marketAddress AND marketId
        const matchingAttestation = allMyAttestations.find(
          (att) =>
            att.marketAddress?.toLowerCase() === marketAddress?.toLowerCase() &&
            att.marketId?.toString() === marketId?.toString(),
        );

        console.log(
          `[AttestationService] Found matching attestation: ${matchingAttestation ? "YES" : "NO"}`,
        );

        const lastAttestation = matchingAttestation || null;

        if (!lastAttestation) {
          // Never attested before
          market._attestationReason = `Never attested (address: ${marketAddress?.substring(0, 8)}..., marketId: ${marketId})`;
          candidateMarkets.push(market);
          continue;
        }

        const createdAt = new Date(lastAttestation.createdAt);
        const hoursSinceLastAttestation =
          (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastAttestation >= 1) { // TESTING: Reduced from 24h to 1h
          // 24+ hours have passed - check if probability changed enough to warrant re-attestation
          const currentPrediction = await this.generatePrediction(market);

          if (currentPrediction && lastAttestation.prediction) {
            // Decode the previous prediction from the uint160 value
            const previousProbability = this.decodeProbability(
              lastAttestation.prediction,
            );

            if (previousProbability !== null) {
              const probabilityChange = Math.abs(
                currentPrediction.probability - previousProbability,
              );

              if (probabilityChange >= this.config.probabilityChangeThreshold) {
                market._attestationReason = `24h+ elapsed AND probability changed by ${probabilityChange.toFixed(1)}% (was ${previousProbability.toFixed(1)}%, now ${currentPrediction.probability}%)`;
                candidateMarkets.push(market);
                continue;
              } else {
                console.log(
                  `[AttestationService] Market ${marketId}: 24h+ elapsed but probability only changed by ${probabilityChange.toFixed(1)}% (threshold: ${this.config.probabilityChangeThreshold}%) - skipping`,
                );
              }
            }
          }
          // If 24h+ passed but couldn't generate prediction or no significant change, skip
          continue;
        }

        // For markets < 24h old, we don't need to check them at all
        console.log(
          `[AttestationService] Market ${marketId}: Only ${hoursSinceLastAttestation.toFixed(1)}h since last attestation - skipping`,
        );
        continue;
      } catch (error) {
        const marketId = market.marketId || market.id;
        elizaLogger.warn(
          `[AttestationService] Could not check attestation status for market ${market.id} (marketId: ${marketId}):`,
          error,
        );
        // If we can't check, consider it eligible to be safe
        market._attestationReason = `Could not verify previous attestation (marketId: ${marketId})`;
        candidateMarkets.push(market);
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
      const predictionPrompt = `
        You are a helpful AI that generates concise tweets. You NEVER use any hashtags or emojis. 
        The tone should be like Matt Levine - savvy, nerdy. NEVER be corny or cliche. 
        Keep under 280 characters. Make clear what the question is and your prediction, current tense.
        All lowercase.
        
        IMPORTANT: Before making your prediction, search the web for recent news and developments related to this market question. Use current information to inform your analysis.
        
        Market Question: ${market.question}
        Current Market Price: ${market.currentPrice || 50}% YES
        Volume: ${market.volume || 0}
        End Date: ${new Date(market.endTimestamp * 1000).toISOString()}
        
        Steps:
        1. Search the web for recent news/events related to: "${market.question}"
        2. Analyze both the market data above AND the recent information you found
        3. Generate a prediction that incorporates current events
        
        Respond with ONLY valid JSON (no other text):
        {
          "probability": <number from 0 to 100>,
          "reasoning": "<savvy tweet-like analysis under 180 characters incorporating recent info, all lowercase>",
          "confidence": <number from 0.0 to 1.0>
        }
        
        Example:
        {"probability": 65, "reasoning": "recent earnings beat expectations but regulatory headwinds mounting. market pricing in mixed signals", "confidence": 0.7}
      `;

      const predictionResponse = await this.runtime.useModel(
        ModelType.TEXT_SMALL,
        {
          prompt: predictionPrompt,
        },
      );

      let prediction;
      try {
        prediction = JSON.parse(predictionResponse);
      } catch (error) {
        const jsonMatch = predictionResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          prediction = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Model did not return JSON format for prediction");
        }
      }

      // Validate the prediction object
      if (
        prediction.probability === undefined ||
        !prediction.reasoning ||
        prediction.confidence === undefined
      ) {
        throw new Error("Model returned incomplete prediction data");
      }

      return prediction;
    } catch (error) {
      elizaLogger.error(
        `[AttestationService] Failed to generate prediction for market ${market.id}:`,
        error,
      );
      return null;
    }
  }

  private async getWalletAddress(): Promise<string | null> {
    try {
      const privateKey =
        process.env.ETHEREUM_PRIVATE_KEY ||
        process.env.EVM_PRIVATE_KEY ||
        process.env.PRIVATE_KEY ||
        process.env.WALLET_PRIVATE_KEY;

      if (!privateKey) {
        elizaLogger.error(
          "[AttestationService] No private key found in environment variables",
        );
        return null;
      }
      const knownAddress = privateKeyToAddress(privateKey as `0x${string}`);

      console.log("[AttestationService] Using wallet address:", knownAddress);
      return knownAddress.toLowerCase();
    } catch (error) {
      elizaLogger.error(
        "[AttestationService] Failed to get wallet address:",
        error,
      );
      return null;
    }
  }

  private async getAllMyAttestations(walletAddress: string): Promise<any[]> {
    try {
      const sapienceService = this.runtime.getService(
        "sapience",
      ) as SapienceService;

      console.log(
        `[AttestationService] Querying all attestations for wallet: ${walletAddress}`,
      );

      // Get all attestations by our wallet address
      const result = await sapienceService.callTool(
        "sapience",
        "get_attestations_by_address",
        {
          attesterAddress: walletAddress,
          // Don't filter by marketId - we want ALL attestations for this wallet
        },
      );

      if (result && result.content) {
        const text = result.content?.[0]?.text ?? "[]";
        const attestations = JSON.parse(text);
        console.log(
          `[AttestationService] Retrieved ${attestations.length} attestations for wallet ${walletAddress}`,
        );

        // Sort by createdAt descending so we get most recent first
        return attestations.sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      }

      return [];
    } catch (error) {
      elizaLogger.error(
        `[AttestationService] Failed to get all attestations for wallet ${walletAddress}:`,
        error,
      );
      return [];
    }
  }

  // getLastAttestationForMarket removed as dead code

  private decodeProbability(predictionValue: string): number | null {
    try {
      // The prediction value is stored as a uint160 representing sqrtPriceX96
      // We need to reverse the calculation from buildAttestationCalldata
      // prediction.reasoning.length > 180 ? prediction.reasoning.substring(0, 177) + '...' : prediction.reasoning,

      // For now, let's implement a basic decoder
      // The exact formula is: sqrtPriceX96 = sqrt(probability/100) * Q96
      const predictionBigInt = BigInt(predictionValue);
      const Q96 = BigInt("79228162514264337593543950336");

      // Reverse: sqrt(price) = (sqrtPriceX96 * 10^18) / Q96
      const sqrtPrice =
        Number((predictionBigInt * BigInt(10 ** 18)) / Q96) / 10 ** 18;

      // price = sqrtPrice^2
      const price = sqrtPrice * sqrtPrice;

      // Convert back to percentage (0-100)
      const probability = price * 100;

      // Clamp to valid range
      return Math.max(0, Math.min(100, probability));
    } catch (error) {
      elizaLogger.warn(
        `[AttestationService] Failed to decode probability ${predictionValue}:`,
        error,
      );
      return null;
    }
  }

  private async testAttestationRetrieval(
    sapienceService: SapienceService,
  ): Promise<void> {
    try {
      elizaLogger.info("[AttestationService] Testing attestation retrieval...");

      // Try to get the wallet address from the environment
      const privateKey =
        process.env.PRIVATE_KEY ||
        process.env.WALLET_PRIVATE_KEY ||
        process.env.ETHEREUM_PRIVATE_KEY ||
        process.env.EVM_PRIVATE_KEY;
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.NODE_ENV !== "staging"
      ) {
        console.log(
          "[AttestationService] Private key available:",
          !!privateKey,
        );
      }

      if (privateKey) {
        // We need to derive the public address from the private key
        // The sapience plugin should be doing this - let's see if we can access it

        // For now, let's try calling get_recent_attestations to see what's in the DB
        const recentResult = await sapienceService.callTool(
          "sapience",
          "get_recent_attestations",
          { limit: 5 },
        );

        console.log(
          "[AttestationService] Recent attestations result:",
          JSON.stringify(recentResult, null, 2),
        );

        if (recentResult && recentResult.content) {
          const text = recentResult.content?.[0]?.text ?? "[]";
          const attestations = JSON.parse(text);
          console.log(
            `[AttestationService] Found ${attestations.length} recent attestations in DB`,
          );

          if (attestations.length > 0) {
            console.log(
              "[AttestationService] Sample attestation:",
              attestations[0],
            );
            console.log("[AttestationService] Attester addresses in DB:", [
              ...new Set(attestations.map((a: any) => a.attester)),
            ]);
          }
        }

        // TODO: Once we figure out how to get the wallet address properly,
        // we can test get_attestations_by_address with the correct address
        console.log(
          "[AttestationService] Need to implement proper address derivation from private key",
        );
      } else {
        elizaLogger.warn(
          "[AttestationService] No private key found in environment",
        );
      }
    } catch (error) {
      elizaLogger.error(
        "[AttestationService] Attestation retrieval test failed:",
        error,
      );
    }
  }

  private async attestToMarket(market: any): Promise<void> {
    try {
      const marketId = market.marketId || market.id;
      elizaLogger.info(
        `[AttestationService] Analyzing market ${market.id} (marketId: ${marketId})`,
      );
      console.log(
        `analyzing market #${marketId}: ${market.question?.substring(0, 80)}...`,
      );
      console.log(`reason for attestation: ${market._attestationReason}`);

      // Generate prediction for this market
      const prediction = await this.generatePrediction(market);

      if (!prediction) {
        elizaLogger.error(
          `[AttestationService] Failed to generate prediction for market ${market.id}`,
        );
        return;
      }

      console.log(
        `prediction: ${prediction.probability}% yes (confidence: ${prediction.confidence})`,
      );
      console.log(`reasoning: ${prediction.reasoning}`);

      // Check confidence threshold
      if (prediction.confidence < this.config.minConfidence) {
        elizaLogger.info(
          `[AttestationService] Skipping market ${market.id} - confidence ${prediction.confidence} below threshold`,
        );
        return;
      }

      // Build attestation calldata
      const { buildAttestationCalldata } = await loadSdk();
      const attestationData = await buildAttestationCalldata(
        {
          marketId: parseInt(market.marketId || market.id),
          address:
            market.marketGroupAddress ||
            market.contractAddress ||
            "0x0000000000000000000000000000000000000000",
          question: market.question,
        },
        prediction,
        parseInt(
          (process.env.CHAIN_ID as string) ||
            ((this.runtime?.character as any)?.settings?.chainId as string) ||
            "42161",
        ),
      );

      if (!attestationData) {
        elizaLogger.error(
          `[AttestationService] Failed to build attestation for market ${market.id}`,
        );
        return;
      }

      // Format transaction data for submitTransactionAction
      const transactionData = {
        to: attestationData.to,
        data: attestationData.data,
        value: attestationData.value || "0",
      };

      // Try to submit using submitTransactionAction
      const actions = this.runtime.actions || [];
      const submitAction = actions.find((a) => a.name === "SUBMIT_TRANSACTION");

      if (submitAction) {
        try {
          // Create a message for the submit action
          const transactionMessage: Memory = {
            entityId: "00000000-0000-0000-0000-000000000000" as any,
            agentId: this.runtime.agentId,
            roomId: "00000000-0000-0000-0000-000000000000" as any,
            content: {
              text: `Submit this transaction: ${JSON.stringify(transactionData)}`,
              action: "SUBMIT_TRANSACTION",
            },
            createdAt: Date.now(),
          };

          elizaLogger.info(
            `[AttestationService] Submitting transaction to ${attestationData.to}`,
          );

          // Execute the submit transaction action
          const txResult = await submitAction.handler(
            this.runtime,
            transactionMessage,
            undefined,
            {},
            undefined,
          );

          elizaLogger.info(
            "[AttestationService] Transaction submission completed",
          );
        } catch (error) {
          elizaLogger.error(
            `[AttestationService] Failed to submit transaction:`,
            error,
          );
          // Continue even if submission fails - still record the attestation attempt
        }
      } else {
        elizaLogger.warn(
          "[AttestationService] SUBMIT_TRANSACTION action not available",
        );
      }

      // After attestation, attempt parlay trading if enabled
      await this.attemptParlayTrading(market, prediction);

      // Record attestation with probability and confidence
      this.attestationHistory.set(market.id, {
        timestamp: new Date(),
        probability: prediction.probability,
        confidence: prediction.confidence,
      });

      elizaLogger.info(
        `[AttestationService] Market ${market.id} attested: ${prediction.probability}% YES (confidence: ${prediction.confidence})`,
      );

      // Concise attestation summary (max 180 chars)
      const attestationSummary = `market #${market.id}: ${prediction.probability}% yes. ${prediction.reasoning.substring(0, 100)}${prediction.reasoning.length > 100 ? "..." : ""}`;
      console.log(`attested: ${attestationSummary}`);
    } catch (error) {
      const marketId = market.marketId || market.id;
      elizaLogger.error(
        `[AttestationService] Failed to process market ${market.id} (marketId: ${marketId}):`,
        error,
      );
    }
  }

  private async attemptParlayTrading(market: any, prediction: any): Promise<void> {
    try {
      // Check if parlay trading is enabled
      const tradingEnabled = process.env.ENABLE_PARLAY_TRADING === "true";
      if (!tradingEnabled) {
        elizaLogger.debug("[AttestationService] Parlay trading disabled");
        return;
      }

      elizaLogger.info(
        `[AttestationService] Attempting parlay trading for market ${market.id}`,
      );

      // Find the parlay trading action
      const actions = this.runtime.actions || [];
      const tradingAction = actions.find((a) => a.name === "PARLAY_TRADING");

      if (!tradingAction) {
        elizaLogger.warn("[AttestationService] PARLAY_TRADING action not available");
        return;
      }

      // Create a message for the trading action
      const tradingMessage: Memory = {
        entityId: "00000000-0000-0000-0000-000000000000" as any,
        agentId: this.runtime.agentId,
        roomId: "00000000-0000-0000-0000-000000000000" as any,
        content: {
          text: `Execute parlay trade: ${JSON.stringify({ market, prediction })}`,
          action: "PARLAY_TRADING",
        },
        createdAt: Date.now(),
      };

      // Execute the trading action
      const tradingCallback: HandlerCallback = async (response: any) => {
        if (response.content?.success) {
          elizaLogger.info(
            `[AttestationService] Parlay trade executed: ${response.content.direction} position (TX: ${response.content.txHash})`,
          );
          console.log(
            `💰 Trade executed: ${response.content.direction} position on "${market.question?.substring(0, 60)}..." (TX: ${response.content.txHash})`,
          );
        } else {
          elizaLogger.debug(
            `[AttestationService] Parlay trade not executed: ${response.text}`,
          );
        }
        return [];
      };

      await tradingAction.handler(
        this.runtime,
        tradingMessage,
        undefined,
        {},
        tradingCallback,
      );
    } catch (error) {
      elizaLogger.error(
        `[AttestationService] Failed to attempt parlay trading:`,
        error,
      );
      // Don't throw - trading is optional
    }
  }

  getStatus(): {
    isRunning: boolean;
    enabled: boolean;
    interval: number;
    minConfidence: number;
    batchSize: number;
    attestationCount: number;
    lastCycle: number | null;
  } {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      interval: this.config.interval,
      minConfidence: this.config.minConfidence,
      batchSize: this.config.batchSize,
      attestationCount: this.attestationHistory.size,
      lastCycle:
        this.attestationHistory.size > 0
          ? Math.max(
              ...Array.from(this.attestationHistory.values()).map(
                (attestation) => attestation.timestamp.getTime(),
              ),
            )
          : null,
    };
  }

  getHistory(limit: number = 10): Array<{
    marketId: string;
    timestamp: string;
    probability: number;
    confidence: number;
  }> {
    const entries = Array.from(this.attestationHistory.entries())
      .sort((a, b) => b[1].timestamp.getTime() - a[1].timestamp.getTime())
      .slice(0, limit)
      .map(([marketId, attestation]) => ({
        marketId,
        timestamp: attestation.timestamp.toISOString(),
        probability: attestation.probability,
        confidence: attestation.confidence,
      }));

    return entries;
  }
}
