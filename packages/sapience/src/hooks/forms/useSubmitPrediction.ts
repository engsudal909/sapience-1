import { useCallback, useState } from 'react';
import { encodeAbiParameters, parseAbiParameters, type Hash } from 'viem';
import { useAccount } from 'wagmi';

import { MarketGroupClassification } from '../../lib/types';
import { SCHEMA_UID } from '~/lib/constants/eas';
import { EAS_ATTEST_ABI, getEASContractAddress } from '~/hooks/contract/EAS';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

// Default to Arbitrum; anticipate most transactions occur on Arbitrum.
// If a market requires a different chain in the future, thread that chainId in via hook params.
const ARBITRUM_CHAIN_ID = 42161;

interface UseSubmitPredictionProps {
  marketAddress: string;
  marketClassification: MarketGroupClassification;
  submissionValue: string; // Value from the form - probability 0-100 (will be converted to D18)
  marketId: number; // Specific market ID for the attestation (for MCQ, this is the ID of the chosen option)
  comment?: string; // Optional comment field
  onSuccess?: () => void; // Callback for successful submission
  /** Resolver contract address */
  resolver?: `0x${string}`;
  /** Condition data (bytes) */
  condition?: `0x${string}`;
}

export function useSubmitPrediction({
  marketAddress,
  marketClassification,
  submissionValue,
  marketId,
  comment = '',
  onSuccess,
  resolver,
  condition,
}: UseSubmitPredictionProps) {
  const { address } = useAccount();

  const [attestationError, setAttestationError] = useState<string | null>(null);
  const [attestationSuccess, setAttestationSuccess] = useState<string | null>(
    null
  );
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const {
    writeContract,
    isPending: isAttesting,
    reset,
  } = useSapienceWriteContract({
    successMessage:
      'Your forecast will appear on this page and your profile shortly.',
    fallbackErrorMessage: 'Forecast submission failed.',
    onTxHash: (hash) => setTxHash(hash),
    onSuccess: () => {
      const successMsg = txHash
        ? `Prediction submitted successfully! Transaction: ${txHash}`
        : 'Prediction submitted successfully!';
      setAttestationSuccess(successMsg);
      setAttestationError(null);
      onSuccess?.();
      setTxHash(undefined);
    },
    onError: (error) => {
      setAttestationError(error.message || 'Prediction submission failed.');
      setAttestationSuccess(null);
      setTxHash(undefined);
    },
    redirectProfileAnchor: 'forecasts',
    // Minimal share intent; UI may provide OG immediately if known
    shareIntent: {},
  });

  const encodeSchemaData = useCallback(
    (
      _marketAddress: string,
      _marketId: string,
      predictionInput: string,
      classification: MarketGroupClassification,
      _comment: string,
      _resolver?: `0x${string}`,
      _condition?: `0x${string}`
    ) => {
      try {
        let finalPredictionBigInt: bigint;

        switch (classification) {
          case MarketGroupClassification.NUMERIC: {
            console.log('predictionInput numeric', predictionInput);
            const inputNum = parseFloat(predictionInput);
            if (Number.isNaN(inputNum) || inputNum < 0) {
              throw new Error(
                'Numeric prediction input must be a valid non-negative number.'
              );
            }
            // D18 format: value * 10^18
            finalPredictionBigInt = BigInt(Math.round(inputNum * 1e18));
            break;
          }
          case MarketGroupClassification.YES_NO:
            console.log('predictionInput yes no', predictionInput);
            // predictionInput is probability 0-100, convert to D18
            finalPredictionBigInt = BigInt(
              Math.round(parseFloat(predictionInput) * 1e18)
            );
            break;
          case MarketGroupClassification.MULTIPLE_CHOICE:
            console.log('predictionInput multiple choice', predictionInput);
            // predictionInput is probability 0-100, convert to D18
            finalPredictionBigInt = BigInt(
              Math.round(parseFloat(predictionInput) * 1e18)
            );
            break;
          default: {
            // This will catch any unhandled enum members at compile time
            const _exhaustiveCheck: never = classification;
            throw new Error(
              `Unsupported market classification for encoding: ${_exhaustiveCheck}`
            );
          }
        }

        return encodeAbiParameters(
          parseAbiParameters(
            'address marketAddress, uint256 marketId, address resolver, bytes condition, uint256 prediction, string comment'
          ),
          [
            _marketAddress as `0x${string}`,
            BigInt(_marketId),
            _resolver ||
              ('0x0000000000000000000000000000000000000000' as `0x${string}`),
            _condition || ('0x' as `0x${string}`),
            finalPredictionBigInt,
            _comment,
          ]
        );
      } catch (error) {
        console.error('Error encoding schema data:', error);
        if (
          error instanceof Error &&
          (error.message.includes('Numeric prediction input must be') ||
            error.message.includes('Unsupported market category'))
        ) {
          throw error;
        }
        throw new Error('Failed to encode prediction data');
      }
    },
    []
  );

  const submitPrediction = useCallback(async () => {
    setAttestationError(null);
    setAttestationSuccess(null);
    reset();

    try {
      if (!address) {
        throw new Error('Wallet not connected. Please connect your wallet.');
      }
      const encodedData = encodeSchemaData(
        marketAddress,
        marketId.toString(),
        submissionValue,
        marketClassification,
        comment,
        resolver,
        condition
      );
      await writeContract({
        chainId: ARBITRUM_CHAIN_ID,
        address: getEASContractAddress(ARBITRUM_CHAIN_ID),
        abi: EAS_ATTEST_ABI,
        functionName: 'attest',
        args: [
          {
            schema: SCHEMA_UID as `0x${string}`,
            data: {
              recipient:
                '0x0000000000000000000000000000000000000000' as `0x${string}`,
              expirationTime: BigInt(0),
              revocable: false,
              refUID:
                '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
              data: encodedData,
              value: BigInt(0),
            },
          },
        ],
      });
    } catch (error) {
      console.error('Attestation submission error:', error);
      setAttestationError(
        error instanceof Error ? error.message : 'Failed to submit prediction'
      );
    }
  }, [
    address,
    marketAddress,
    marketClassification,
    submissionValue,
    marketId,
    comment,
    resolver,
    condition,
    encodeSchemaData,
    writeContract,
    reset,
    setAttestationError,
    setAttestationSuccess,
  ]);

  const resetStatus = useCallback(() => {
    setAttestationError(null);
    setAttestationSuccess(null);
  }, []);

  return {
    submitPrediction,
    isAttesting,
    attestationError,
    attestationSuccess,
    resetAttestationStatus: resetStatus,
  };
}
