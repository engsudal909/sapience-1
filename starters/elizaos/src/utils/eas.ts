import { elizaLogger } from "@elizaos/core";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
} from "viem";

// EAS contract addresses by chain
const EAS_CONTRACTS: Record<number, string> = {
  1: "0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587", // Ethereum Mainnet
  11155111: "0xC2679fBD37d54388Ce493F1DB75320D236e1815e", // Sepolia
  10: "0x4200000000000000000000000000000000000021", // Optimism
  8453: "0x4200000000000000000000000000000000000021", // Base
  42161: "0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458", // Arbitrum
};

// Prediction market schema
const SCHEMA_ID =
  "0x2dbb0921fa38ebc044ab0a7fe109442c456fb9ad39a68ce0a32f193744d17744";

// EAS ABI for attestation
const EAS_ABI = [
  {
    name: "attest",
    type: "function",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "payable",
  },
] as const;

interface Market {
  marketId: number;
  address: string;
  question: string;
}

interface Prediction {
  probability: number;
  reasoning: string;
  confidence: number;
}

export interface AttestationCalldata {
  to: string;
  data: string;
  value: string;
  chainId: number;
  description: string;
}

export async function buildAttestationCalldata(
  market: Market,
  prediction: Prediction,
  chainId: number = 42161, // Default to Arbitrum
  conditionId?: `0x${string}`,
): Promise<AttestationCalldata | null> {
  try {
    
    // For parlay condition attestations, we MUST have a condition ID
    // For regular market attestations, we can use zeros
    let questionId: `0x${string}`;
    if (conditionId) {
      questionId = conditionId;
    } else {
      // Only allow missing condition ID for regular market attestations (non-zero marketId)
      if (market.marketId === 0) {
        elizaLogger.error("[EAS] Missing condition ID for parlay attestation (marketId=0)");
        throw new Error("Condition ID is required for parlay attestations");
      }
      questionId = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    }
    
    // Use Viem to encode the attestation data directly
    // Schema: 'address marketAddress,uint256 marketId,bytes32 questionId,uint160 prediction,string comment'
    const encodedData = encodeAbiParameters(
      parseAbiParameters(
        "address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment",
      ),
      [
        market.address as `0x${string}`,
        BigInt(market.marketId),
        questionId,
        (() => {
          // Convert probability (0-100) to price (0-1)
          const price = prediction.probability / 100;

          // Calculate sqrtPriceX96 using the same formula as the working frontend
          const effectivePrice = price * 10 ** 18;
          const sqrtEffectivePrice = Math.sqrt(effectivePrice);
          const JS_2_POW_96 = 2 ** 96;
          const sqrtPriceX96Float = sqrtEffectivePrice * JS_2_POW_96;
          return BigInt(Math.round(sqrtPriceX96Float));
        })(), // Calculate sqrtPriceX96 for the prediction
        prediction.reasoning.length > 180
          ? prediction.reasoning.substring(0, 177) + "..."
          : prediction.reasoning,
      ],
    );

    // Build the attestation request
    const attestationRequest = {
      schema: SCHEMA_ID as `0x${string}`,
      data: {
        recipient:
          "0x0000000000000000000000000000000000000000" as `0x${string}`,
        expirationTime: 0n,
        revocable: false,
        refUID:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        data: encodedData as `0x${string}`,
        value: 0n,
      },
    };

    // Encode the function call
    const calldata = encodeFunctionData({
      abi: EAS_ABI,
      functionName: "attest",
      args: [attestationRequest],
    });

    const easAddress = EAS_CONTRACTS[chainId];
    if (!easAddress) {
      elizaLogger.warn(`No EAS contract for chain ${chainId}`);
      return null;
    }


    return {
      to: easAddress,
      data: calldata,
      value: "0",
      chainId,
      description: `Attest: ${prediction.probability}% YES for market ${market.marketId}`,
    };
  } catch (error) {
    elizaLogger.error("Error building attestation calldata:", error);
    return null;
  }
}
