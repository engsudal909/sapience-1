import { encodeAbiParameters, encodeFunctionData, parseAbiParameters } from 'viem';
import type { Address } from 'viem';
import { contracts } from '../contracts/addresses';
import { DEFAULT_CHAIN_ID } from '../constants/chain';

type Hex = `0x${string}`;

export type AttestationCalldata = {
  to: Address;
  data: Hex;
  value: string;
  chainId: number;
  description: string;
};

// EAS ABI (attest)
const EAS_ABI = [
  {
    name: 'attest',
    type: 'function',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'payable',
  },
] as const;

// EAS schema id for prediction market attestations
const SCHEMA_ID: Hex =
  '0x2dbb0921fa38ebc044ab0a7fe109442c456fb9ad39a68ce0a32f193744d17744';

export function decodeProbabilityFromUint160(value: string): number | null {
  try {
    const predictionBigInt = BigInt(value);
    const Q96 = BigInt('79228162514264337593543950336');
    const sqrtPrice = Number((predictionBigInt * BigInt(10 ** 18)) / Q96) / 10 ** 18;
    const price = sqrtPrice * sqrtPrice;
    const probability = price * 100;
    return Math.max(0, Math.min(100, probability));
  } catch {
    return null;
  }
}

export async function buildAttestationCalldata(
  market: { marketId: number; address: Address; question: string },
  prediction: { probability: number; reasoning: string; confidence: number },
  chainId: number = DEFAULT_CHAIN_ID,
  conditionId?: Hex,
): Promise<AttestationCalldata | null> {
  const encodedData = encodeAbiParameters(
    parseAbiParameters(
      'address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment',
    ),
    [
      market.address,
      BigInt(market.marketId),
      (conditionId || ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex)) as Hex,
      (() => {
        const price = prediction.probability / 100;
        const effectivePrice = price * 10 ** 18;
        const sqrtEffectivePrice = Math.sqrt(effectivePrice);
        const JS_2_POW_96 = 2 ** 96;
        const sqrtPriceX96Float = sqrtEffectivePrice * JS_2_POW_96;
        return BigInt(Math.round(sqrtPriceX96Float));
      })(),
      prediction.reasoning.length > 180
        ? `${prediction.reasoning.substring(0, 177)}...`
        : prediction.reasoning,
    ],
  );

  const attestationRequest = {
    schema: SCHEMA_ID,
    data: {
      recipient: '0x0000000000000000000000000000000000000000' as Address,
      expirationTime: 0n,
      revocable: false,
      refUID: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      data: encodedData as Hex,
      value: 0n,
    },
  } as const;

  const calldata = encodeFunctionData({
    abi: EAS_ABI,
    functionName: 'attest',
    args: [attestationRequest],
  });

  // EAS addresses live in contracts/addresses.ts for consistency with the repo
  const easAddress = (contracts as any).eas?.[chainId]?.address as Address | undefined;
  if (!easAddress) {
    return null;
  }

  return {
    to: easAddress,
    data: calldata as Hex,
    value: '0',
    chainId,
    description: `Attest: ${prediction.probability}% YES for market ${market.marketId}`,
  };
}


