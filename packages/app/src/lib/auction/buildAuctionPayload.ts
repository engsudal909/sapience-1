import { encodeAbiParameters } from 'viem';
import { umaResolver, lzPMResolver } from '@sapience/sdk/contracts';
import { CHAIN_ID_ARBITRUM, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

export interface PredictedOutcomeInputStub {
  marketId: string; // The id from API (already encoded claim:endTime)
  prediction: boolean;
}

function encodePredictedOutcomes(
  outcomes: PredictedOutcomeInputStub[]
): `0x${string}` {
  // Convert marketId string to bytes32 format
  const normalized = outcomes.map((o) => ({
    marketId: (o.marketId.startsWith('0x')
      ? o.marketId
      : `0x${o.marketId}`) as `0x${string}`,
    prediction: !!o.prediction,
  }));

  return encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'marketId', type: 'bytes32' },
          { name: 'prediction', type: 'bool' },
        ],
      },
    ],
    [normalized]
  );
}

export function buildAuctionStartPayload(
  outcomes: PredictedOutcomeInputStub[],
  chainId?: number
): { resolver: `0x${string}`; predictedOutcomes: `0x${string}`[] } {
  // Select the correct resolver based on chain ID
  const targetChainId = chainId || CHAIN_ID_ARBITRUM;
  let resolverAddress: `0x${string}` | undefined;

  if (targetChainId === CHAIN_ID_ETHEREAL) {
    resolverAddress = lzPMResolver[CHAIN_ID_ETHEREAL]?.address;
  } else {
    resolverAddress = umaResolver[CHAIN_ID_ARBITRUM]?.address;
  }

  const resolver: `0x${string}` =
    resolverAddress ||
    ('0x0000000000000000000000000000000000000000' as `0x${string}`);

  // Resolver expects a single bytes blob with abi.encode(PredictedOutcome[])
  const encoded = encodePredictedOutcomes(outcomes);
  const predictedOutcomes = [encoded];

  return { resolver, predictedOutcomes };
}
