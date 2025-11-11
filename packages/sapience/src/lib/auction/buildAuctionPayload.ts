import { encodeAbiParameters } from 'viem';
import { umaResolver, predictionMarket } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

export interface PredictedOutcomeInputStub {
  marketId: string; // The id from API (already encoded claim:endTime)
  prediction: boolean;
}

function isHexAddress(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
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
  chainId: number,
  resolverOverride?: string
): {
  predictions: {
    verifierContract: `0x${string}`;
    resolverContract: `0x${string}`;
    predictedOutcomes: `0x${string}`;
  }[];
} {
  // Resolve contracts
  const cid =
    Number.isFinite(chainId) && chainId > 0 ? chainId : DEFAULT_CHAIN_ID;
  const verifierContract = predictionMarket[cid]?.address;
  const UMA_RESOLVER_ADDRESS = umaResolver[cid]?.address;
  const resolverContract: `0x${string}` = isHexAddress(resolverOverride)
    ? resolverOverride
    : UMA_RESOLVER_ADDRESS;

  const encoded = encodePredictedOutcomes(outcomes);
  const predictions = [
    {
      verifierContract,
      resolverContract,
      predictedOutcomes: encoded,
    },
  ];

  return { predictions };
}
