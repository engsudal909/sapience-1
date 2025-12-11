'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { predictionMarketAbi } from '@sapience/sdk';
import { getPublicClientForChainId } from '~/lib/utils/util';
import type {
  MintPredictionRequestData,
  QuoteBid,
} from '~/lib/auction/useAuctionStart';

type UseBidSimulationArgs = {
  bids: QuoteBid[];
  chainId?: number;
  predictionMarketAddress?: `0x${string}`;
  buildMintRequestDataFromBid?: (args: {
    selectedBid: QuoteBid;
    refCode?: `0x${string}`;
  }) => MintPredictionRequestData | null;
};

function toBigInt(value: string | number | bigint | undefined): bigint {
  if (typeof value === 'bigint') return value;
  if (value === undefined) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/**
 * Simulate incoming bids against PredictionMarket.mint to detect failures early.
 * Bids are marked with simulationStatus = success | failed | pending.
 */
export function useBidSimulation({
  bids,
  chainId,
  predictionMarketAddress,
  buildMintRequestDataFromBid,
}: UseBidSimulationArgs): QuoteBid[] {
  const [simulatedBids, setSimulatedBids] = useState<QuoteBid[]>(bids);

  // Track which bids we've already simulated to avoid re-simulating
  const simulatedSignaturesRef = useRef<Map<string, 'success' | 'failed'>>(
    new Map()
  );

  const canSimulate = useMemo(() => {
    return (
      Boolean(chainId) &&
      Boolean(predictionMarketAddress) &&
      typeof buildMintRequestDataFromBid === 'function' &&
      bids.length > 0
    );
  }, [
    bids.length,
    buildMintRequestDataFromBid,
    chainId,
    predictionMarketAddress,
  ]);

  useEffect(() => {
    if (!canSimulate) {
      // Preserve cached simulation results even when simulation is disabled
      setSimulatedBids(
        bids.map((b) => ({
          ...b,
          simulationStatus:
            simulatedSignaturesRef.current.get(b.makerSignature) ??
            b.simulationStatus ??
            'pending',
        }))
      );
      return;
    }

    let canceled = false;
    const client = getPublicClientForChainId(chainId as number);

    const simulate = async () => {
      const updated = await Promise.all(
        bids.map(async (bid) => {
          // Check cache first to avoid re-simulating
          const cachedStatus = simulatedSignaturesRef.current.get(
            bid.makerSignature
          );
          if (cachedStatus) {
            return { ...bid, simulationStatus: cachedStatus };
          }

          const mintData = buildMintRequestDataFromBid?.({
            selectedBid: bid,
          });

          if (!mintData) {
            simulatedSignaturesRef.current.set(bid.makerSignature, 'failed');
            return { ...bid, simulationStatus: 'failed' as const };
          }

          const requestArg = {
            encodedPredictedOutcomes: mintData.encodedPredictedOutcomes,
            resolver: mintData.resolver,
            makerCollateral: toBigInt(mintData.makerCollateral),
            takerCollateral: toBigInt(mintData.takerCollateral),
            maker: mintData.maker,
            taker: mintData.taker,
            makerNonce: toBigInt(mintData.makerNonce),
            takerSignature: mintData.takerSignature,
            takerDeadline: toBigInt(mintData.takerDeadline),
            refCode: mintData.refCode,
          } as const;

          try {
            await client.simulateContract({
              address: predictionMarketAddress as `0x${string}`,
              abi: predictionMarketAbi,
              functionName: 'mint',
              args: [requestArg],
              account: mintData.maker,
            });
            simulatedSignaturesRef.current.set(bid.makerSignature, 'success');
            return { ...bid, simulationStatus: 'success' as const };
          } catch {
            simulatedSignaturesRef.current.set(bid.makerSignature, 'failed');
            return { ...bid, simulationStatus: 'failed' as const };
          }
        })
      );

      if (!canceled) {
        setSimulatedBids(updated);
      }
    };

    simulate();

    return () => {
      canceled = true;
    };
  }, [
    bids,
    canSimulate,
    chainId,
    predictionMarketAddress,
    buildMintRequestDataFromBid,
  ]);

  return simulatedBids;
}
