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
  prediction: Prediction,
  chainId: number = 42161, // Default to Arbitrum
  conditionId?: `0x${string}`,
): Promise<AttestationCalldata | null> {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

  try {
    // Use Viem to encode the attestation data directly
    // Schema: 'address marketAddress,uint256 marketId,bytes32 questionId,uint160 prediction,string comment'
    const encodedData = encodeAbiParameters(
      parseAbiParameters(
        "address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment",
      ),
      [
        ZERO_ADDRESS,
        0n,
        conditionId || ZERO_BYTES32,
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
        recipient: ZERO_ADDRESS,
        expirationTime: 0n,
        revocable: false,
        refUID: ZERO_BYTES32,
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
      description: `Attest: ${prediction.probability}% YES`,
    };
  } catch (error) {
    elizaLogger.error("Error building attestation calldata:", error);
    return null;
  }
}
