import { predictionMarket } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

const predictionMarketAbi = [
  {
    type: 'function',
    name: 'burn',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'refCode', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

export function usePredictionMarketWriteContract(opts?: {
  successMessage?: string;
  fallbackErrorMessage?: string;
  onSuccess?: (receipt: any) => void;
  onError?: (error: Error) => void;
}) {
  const { writeContract, isPending } = useSapienceWriteContract({
    successMessage: opts?.successMessage,
    fallbackErrorMessage: opts?.fallbackErrorMessage,
    onSuccess: opts?.onSuccess,
    onError: opts?.onError,
  });

  // Arbitrum One + PredictionMarket address
  const APP_CHAIN_ID = DEFAULT_CHAIN_ID;
  const PREDICTION_MARKET_ADDRESS = predictionMarket[DEFAULT_CHAIN_ID]?.address;

  function burn(tokenId: bigint, refCode: `0x${string}`) {
    if (!PREDICTION_MARKET_ADDRESS || !APP_CHAIN_ID) return;
    return writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'burn',
      args: [tokenId, refCode],
      chainId: APP_CHAIN_ID,
    });
  }

  return { burn, isPending };
}
