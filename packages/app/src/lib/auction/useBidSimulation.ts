'use client';

import { useEffect, useMemo, useState } from 'react';
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

  // Reset local state when bids change
  useEffect(() => {
    setSimulatedBids((prev) => {
      // Preserve existing simulationStatus when possible
      const prevMap = new Map(prev.map((b) => [b.makerSignature, b]));
      return bids.map((b) => {
        const existing = prevMap.get(b.makerSignature);
        return {
          ...b,
          simulationStatus:
            existing?.simulationStatus ?? b.simulationStatus ?? 'pending',
        };
      });
    });
  }, [bids]);

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
      setSimulatedBids(bids);
      return;
    }

    let canceled = false;
    const client = getPublicClientForChainId(chainId as number);

    const simulate = async () => {
      const updated = await Promise.all(
        bids.map(async (bid) => {
          // Early exit if we've already marked this bid
          if (bid.simulationStatus && bid.simulationStatus !== 'pending') {
            return bid;
          }

          const mintData = buildMintRequestDataFromBid?.({
            selectedBid: bid,
          });

          if (!mintData) {
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
            return { ...bid, simulationStatus: 'success' as const };
          } catch {
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
