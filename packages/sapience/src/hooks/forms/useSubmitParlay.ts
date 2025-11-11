import { useCallback, useState } from 'react';
import {
  encodeFunctionData,
  erc20Abi,
  encodeAbiParameters,
  keccak256,
  getAddress,
} from 'viem';

import { predictionMarketAbi } from '@sapience/sdk';
import { useAccount, useReadContract, useSignTypedData } from 'wagmi';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import type { MintPredictionRequestData } from '~/lib/auction/useAuctionStart';

interface UseSubmitParlayProps {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  onSuccess?: () => void;
  enabled?: boolean;
  onOrderCreated?: (
    makerNftId: bigint,
    takerNftId: bigint,
    txHash?: string
  ) => void;
}

export function useSubmitParlay({
  chainId,
  predictionMarketAddress,
  collateralTokenAddress,
  onSuccess,
  enabled = true,
}: UseSubmitParlayProps) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  // Read maker nonce from PredictionMarket
  const { data: makerNonce, refetch: refetchMakerNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !!address && !!predictionMarketAddress && enabled,
    },
  });

  // Check current allowance to avoid unnecessary approvals
  const { data: currentAllowance } = useReadContract({
    address: collateralTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      address && predictionMarketAddress
        ? [address, predictionMarketAddress]
        : undefined,
    chainId,
    query: {
      enabled:
        !!address &&
        !!collateralTokenAddress &&
        !!predictionMarketAddress &&
        enabled,
    },
  });

  // removed debug logging

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Use unified write/sendCalls wrapper (handles chain validation and tx monitoring)
  const { sendCalls, isPending: isSubmitting } = useSapienceWriteContract({
    onSuccess: () => {
      setSuccess('Parlay prediction minted successfully');
      setError(null);
      onSuccess?.();
    },
    onError: (err) => {
      const message = err?.message || 'Transaction failed';
      setError(message);
    },
    successMessage: 'Parlay prediction was successful',
    fallbackErrorMessage: 'Failed to submit parlay prediction',
    redirectProfileAnchor: 'parlays',
    // Minimal share intent for parlay; callers can include OG if they compute it
    shareIntent: {},
  });

  // Prepare calls for sendCalls
  const prepareCalls = useCallback(
    (mintData: MintPredictionRequestData) => {
      const callsArray: { to: `0x${string}`; data: `0x${string}` }[] = [];

      // Parse collateral amounts
      const makerCollateralWei = BigInt(mintData.makerCollateral);
      const takerCollateralWei = BigInt(mintData.takerCollateral);

      // Validate inputs
      if (makerCollateralWei <= 0 || takerCollateralWei <= 0) {
        throw new Error('Invalid collateral amounts');
      }

      // Only add approval if current allowance is insufficient
      const needsApproval =
        !currentAllowance || currentAllowance < makerCollateralWei;

      if (needsApproval) {
        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [predictionMarketAddress, makerCollateralWei],
        });

        callsArray.push({
          to: collateralTokenAddress,
          data: approveCalldata,
        });
      }

      // Convert mintData to the structure expected by the contract
      const makerNonceBigInt =
        mintData.makerNonce !== undefined
          ? BigInt(mintData.makerNonce)
          : undefined;
      if (makerNonceBigInt === undefined) {
        throw new Error('Missing maker nonce');
      }

      const mintPredictionRequestData = {
        encodedPredictedOutcomes: mintData.encodedPredictedOutcomes,
        resolver: mintData.resolver,
        makerCollateral: makerCollateralWei,
        takerCollateral: takerCollateralWei,
        maker: mintData.maker,
        taker: mintData.taker,
        makerNonce: makerNonceBigInt,
        takerSignature: mintData.takerSignature,
        takerDeadline: BigInt(mintData.takerDeadline),
        refCode: mintData.refCode,
      };

      // Add PredictionMarket.mint call
      const mintCalldata = encodeFunctionData({
        abi: predictionMarketAbi,
        functionName: 'mint',
        args: [mintPredictionRequestData],
      });

      callsArray.push({
        to: predictionMarketAddress,
        data: mintCalldata,
      });

      return callsArray;
    },
    [predictionMarketAddress, collateralTokenAddress, currentAllowance]
  );

  const submitParlay = useCallback(
    async (mintData: MintPredictionRequestData) => {
      if (!enabled || !address) {
        return;
      }

      setError(null);
      setSuccess(null);

      const attempt = async (forceRefetch: boolean) => {
        // Ensure we have a fresh nonce when requested
        const nonceValue = forceRefetch
          ? (await refetchMakerNonce()).data
          : makerNonce;

        if (nonceValue === undefined) {
          throw new Error('Unable to read maker nonce');
        }

        let filled: MintPredictionRequestData = {
          ...mintData,
          makerNonce: nonceValue as unknown as bigint,
        };

        // Create taker approval signature if missing
        const missingSig =
          !filled.takerSignature ||
          typeof filled.takerSignature !== 'string' ||
          filled.takerSignature.length < 10;
        if (missingSig) {
          const inner = encodeAbiParameters(
            [
              { type: 'bytes' }, // encodedPredictedOutcomes
              { type: 'uint256' }, // takerCollateral
              { type: 'uint256' }, // makerCollateral
              { type: 'address' }, // resolver
              { type: 'address' }, // maker
              { type: 'uint256' }, // takerDeadline
              { type: 'uint256' }, // makerNonce
            ],
            [
              filled.encodedPredictedOutcomes,
              BigInt(filled.takerCollateral),
              BigInt(filled.makerCollateral),
              getAddress(filled.resolver),
              getAddress(filled.maker),
              BigInt(filled.takerDeadline),
              BigInt(filled.makerNonce || 0),
            ]
          );
          const messageHash = keccak256(inner);
          const domain = {
            name: 'SignatureProcessor',
            version: '1',
            chainId,
            verifyingContract: predictionMarketAddress,
          } as const;
          const types = {
            Approve: [
              { name: 'messageHash', type: 'bytes32' },
              { name: 'owner', type: 'address' },
            ],
          } as const;
          const message = {
            messageHash,
            owner: getAddress(address),
          } as const;
          const signature = await signTypedDataAsync({
            domain,
            types,
            primaryType: 'Approve',
            message,
          });
          filled = { ...filled, takerSignature: signature };
        }

        const calls = prepareCalls(filled);
        if (calls.length === 0) {
          throw new Error('No valid calls to execute');
        }

        await sendCalls({
          calls,
          chainId,
        });
      };

      try {
        // Validate mint data
        if (!mintData) {
          throw new Error('No mint data provided');
        }

        // First attempt with current cached nonce
        await attempt(false);
      } catch (err: any) {
        const msg = (err?.message || '').toString();
        const isNonceErr = msg.includes('InvalidMakerNonce');
        if (isNonceErr) {
          try {
            // One-time retry with fresh nonce
            await attempt(true);
            return;
          } catch (retryErr: any) {
            const retryMsg = (retryErr?.message || '').toString();
            setError(
              retryMsg || 'Failed to submit parlay prediction after retry'
            );
            return;
          }
        }
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to submit parlay prediction';
        setError(errorMessage);
      }
    },
    [
      enabled,
      address,
      chainId,
      prepareCalls,
      sendCalls,
      makerNonce,
      refetchMakerNonce,
    ]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    submitParlay,
    isSubmitting,
    error,
    success,
    reset,
  };
}
