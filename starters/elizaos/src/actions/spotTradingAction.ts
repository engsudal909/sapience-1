import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
import { parseEther, createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum } from "viem/chains";

// Sapience Quoter API endpoint for spot market quotes
const QUOTER_API_BASE = "https://api.sapience.xyz/quoter";

interface SpotTradingConfig {
  enabled: boolean;
  wagerAmount: string; // In USDe units (18 decimals), default $1
  minProbabilityThreshold: number; // Only trade if confidence is above this
  chainId: number; // Chain ID for trading (Base = 8453, Arbitrum = 42161)
}

// Convert forecast percentage to expected price decimal string
function forecastToExpectedPriceDecimalString(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  if (clamped === 0) return '0.0000009';
  return (clamped / 100).toString();
}

// Get quote from Quoter API
async function getQuote({ 
  chainId, 
  marketGroupAddress, 
  marketId, 
  forecastPercent,
  wagerAmount 
}: {
  chainId: number;
  marketGroupAddress: string;
  marketId: number | string;
  forecastPercent: number;
  wagerAmount: string;
}): Promise<{ positionSize: bigint; success: boolean; error?: string }> {
  try {
    const expectedPrice = forecastToExpectedPriceDecimalString(forecastPercent);
    const url = `${QUOTER_API_BASE}/${chainId}/${marketGroupAddress}/${marketId}?collateralAvailable=${wagerAmount}&expectedPrice=${expectedPrice}`;
    
    elizaLogger.info(`[SpotTrading] Getting quote from: ${url}`);
    
    const res = await fetch(url);
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      elizaLogger.error(`[SpotTrading] Quoter error ${res.status}: ${errorText}`);
      return { positionSize: 0n, success: false, error: `Quoter error ${res.status}` };
    }
    
    const data = await res.json() as { maxSize: string };
    const positionSize = BigInt(data.maxSize);
    
    elizaLogger.info(`[SpotTrading] Quote received: positionSize=${positionSize.toString()}`);
    
    return { positionSize, success: true };
  } catch (error: any) {
    elizaLogger.error(`[SpotTrading] Failed to get quote: ${error.message}`);
    return { positionSize: 0n, success: false, error: error.message };
  }
}

// Execute trade on-chain
async function executeTrade({ 
  marketAddress, 
  marketId, 
  positionSize,
  wagerAmount,
  privateKey,
  chainId
}: {
  marketAddress: `0x${string}`;
  marketId: bigint;
  positionSize: bigint;
  wagerAmount: bigint;
  privateKey: `0x${string}`;
  chainId: number;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const account = privateKeyToAccount(privateKey);
    const chain = arbitrum; // Always use Arbitrum
    
    const walletClient = createWalletClient({ 
      account, 
      chain, 
      transport: http() 
    });
    
    const publicClient = createPublicClient({ 
      chain, 
      transport: http() 
    });

    // Foil ABI for createTraderPosition - expects a struct parameter
    // Note: This uses the current contract interface with struct parameters.
    // The docs examples may show an older individual parameter format.
    const foilAbi = [
      {
        name: "createTraderPosition",
        type: "function",
        inputs: [
          { 
            name: "params", 
            type: "tuple",
            components: [
              { name: "marketId", type: "uint256" },
              { name: "size", type: "int256" },
              { name: "maxCollateral", type: "uint256" },
              { name: "deadline", type: "uint256" }
            ]
          }
        ],
        outputs: [],
      }
    ] as const;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60); // 1 hour deadline

    // USDe token address (collateral token) - configurable via environment
    const USDE_TOKEN_ADDRESS = (process.env.USDE_TOKEN_ADDRESS || "0xfEb8C4d5eFbaFf6e928eA090Bc660c363f883DBA") as `0x${string}`; // Default to test USDe on Arbitrum

    // ERC20 approve ABI
    const erc20Abi = [
      {
        name: "approve",
        type: "function",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }],
      }
    ] as const;

    elizaLogger.info(`[SpotTrading] Approving USDe token for market contract...`);
    
    // First, approve the market contract to spend USDe tokens
    const approveHash = await walletClient.writeContract({
      address: USDE_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [marketAddress, wagerAmount],
    });

    elizaLogger.info(`[SpotTrading] Approval transaction: ${approveHash}`);

    // Wait for approval confirmation
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    elizaLogger.info(`[SpotTrading] Approval confirmed`);

    elizaLogger.info(`[SpotTrading] Executing trade on ${chain.name}:`);
    elizaLogger.info(`  Market: ${marketAddress}`);
    elizaLogger.info(`  MarketId: ${marketId}`);
    elizaLogger.info(`  PositionSize: ${positionSize}`);
    elizaLogger.info(`  Wager: ${wagerAmount}`);
    elizaLogger.info(`  Deadline: ${deadline}`);

    const hash = await walletClient.writeContract({
      address: marketAddress,
      abi: foilAbi,
      functionName: 'createTraderPosition',
      args: [{
        marketId: marketId,
        size: positionSize,
        maxCollateral: wagerAmount,
        deadline: deadline
      }],
    });

    elizaLogger.info(`[SpotTrading] Transaction submitted: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      elizaLogger.info(`[SpotTrading] Transaction confirmed: ${hash}`);
      return { success: true, txHash: hash };
    } else {
      elizaLogger.error(`[SpotTrading] Transaction failed: ${hash}`);
      return { success: false, error: 'Transaction reverted' };
    }
  } catch (error: any) {
    elizaLogger.error(`[SpotTrading] Failed to execute trade: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export const spotTradingAction: Action = {
  name: "SPOT_TRADING",
  description: "Make $1 wagers on individual spot markets using Quoter API",
  similes: ["trade spot", "make spot wager", "place spot bet"],

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
      const tradingEnabled = process.env.ENABLE_SPOT_TRADING === "true";
      if (!tradingEnabled) {
        elizaLogger.info("[SpotTrading] Trading disabled via ENABLE_SPOT_TRADING env var");
        await callback?.({
          text: "Spot trading is disabled. Set ENABLE_SPOT_TRADING=true to enable.",
          content: {},
        });
        return;
      }

      // Parse the message content to extract market data and prediction
      const text = message.content?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        await callback?.({
          text: 'Provide market data and prediction: {"market": {...}, "prediction": {...}}',
          content: {},
        });
        return;
      }

      const data = JSON.parse(jsonMatch[0]);
      
      if (!data.market || !data.prediction) {
        await callback?.({
          text: 'Invalid format. Provide {"market": {...}, "prediction": {...}}',
          content: {},
        });
        return;
      }

      const market = data.market;
      const prediction = data.prediction;

      // Get trading configuration
      const config: SpotTradingConfig = {
        enabled: true,
        wagerAmount: process.env.WAGER_AMOUNT || "1000000000000000000", // $1 in USDe (18 decimals)
        minProbabilityThreshold: parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6"),
        chainId: parseInt(process.env.CHAIN_ID || "42161"), // Default to Arbitrum, but allow override
      };

      // Check if prediction meets confidence threshold
      if (prediction.confidence < config.minProbabilityThreshold) {
        elizaLogger.info(
          `[SpotTrading] Skipping trade - confidence ${prediction.confidence} below threshold`,
        );
        await callback?.({
          text: `Skipping trade: confidence ${prediction.confidence} below threshold ${config.minProbabilityThreshold}`,
          content: {},
        });
        return;
      }

      // Determine trade direction based on probability
      const forecastPercent = prediction.probability; // Use probability directly for price

      elizaLogger.info(
        `[SpotTrading] Trading spot market: "${market.question?.substring(0, 50)}" - ${forecastPercent}% (confidence: ${prediction.confidence})`,
      );

      // Get wallet details
      const privateKey = (process.env.ETHEREUM_PRIVATE_KEY ||
        process.env.EVM_PRIVATE_KEY ||
        process.env.PRIVATE_KEY ||
        process.env.WALLET_PRIVATE_KEY) as `0x${string}` | undefined;
      
      if (!privateKey) {
        throw new Error("Missing private key for trading");
      }

      // Get market group address (this is the Foil contract address)
      const marketGroupAddress = market.marketGroupAddress || 
                               market.contractAddress || 
                               market.address;
      
      if (!marketGroupAddress) {
        throw new Error("Missing market group address");
      }

      // Get market ID (should be a number)
      const marketId = market.marketId || market.id || "1";

      // Get quote from Quoter API
      const { positionSize, success: quoteSuccess, error: quoteError } = await getQuote({
        chainId: config.chainId,
        marketGroupAddress,
        marketId,
        forecastPercent,
        wagerAmount: config.wagerAmount,
      });

      if (!quoteSuccess || positionSize === 0n) {
        throw new Error(quoteError || "Failed to get valid quote");
      }

      // Execute the trade
      const tradeResult = await executeTrade({
        marketAddress: marketGroupAddress as `0x${string}`,
        marketId: BigInt(marketId),
        positionSize,
        wagerAmount: BigInt(config.wagerAmount),
        privateKey,
        chainId: config.chainId,
      });

      if (tradeResult.success) {
        const direction = prediction.probability > 50 ? "YES" : "NO";
        elizaLogger.info(
          `[SpotTrading] Spot trade executed successfully: ${tradeResult.txHash}`,
        );
        await callback?.({
          text: `Spot trade executed: ${forecastPercent}% on "${market.question?.substring(0, 50)}..." (TX: ${tradeResult.txHash})`,
          content: {
            success: true,
            direction,
            forecastPercent,
            market: market.question,
            confidence: prediction.confidence,
            txHash: tradeResult.txHash,
            chainId: config.chainId,
          },
        });
      } else {
        throw new Error(tradeResult.error || "Trade execution failed");
      }
    } catch (err: any) {
      elizaLogger.error("[SpotTrading] Trading failed:", err);
      await callback?.({
        text: `Trading failed: ${err?.message}`,
        content: { success: false, error: err?.message },
      });
    }
  },
};

export default spotTradingAction;