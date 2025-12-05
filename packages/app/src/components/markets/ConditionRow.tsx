'use client';

import * as React from 'react';
import { useReadContract } from 'wagmi';
import { toHex, concatHex, keccak256 } from 'viem';
import { umaResolver } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import MarketBadge from '~/components/markets/MarketBadge';

// UMA resolver ABI for wrappedMarkets query
const umaWrappedMarketAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'wrappedMarkets',
    outputs: [
      { internalType: 'bool', name: 'initialized', type: 'bool' },
      { internalType: 'bool', name: 'resolved', type: 'bool' },
      { internalType: 'bool', name: 'payout', type: 'bool' },
      { internalType: 'bytes32', name: 'assertionId', type: 'bytes32' },
      { internalType: 'uint8', name: 'payoutStatus', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface ConditionRowProps {
  condition: {
    id?: string;
    question: string;
    shortName?: string | null;
    category?: { id?: number; name?: string; slug?: string } | null;
    endTime?: number | null;
    claimStatement?: string | null;
    description?: string | null;
    similarMarkets?: string[] | null;
  };
  color: string;
}

// Forecast cell that shows prediction request or resolution status
function ForecastCell({
  conditionId,
  claimStatement,
  endTime,
}: {
  conditionId?: string;
  claimStatement?: string | null;
  endTime?: number | null;
}) {
  // Check if past end time synchronously (no state needed)
  const nowSec = Math.floor(Date.now() / 1000);
  const isPastEnd = !!endTime && endTime <= nowSec;

  const UMA_CHAIN_ID = DEFAULT_CHAIN_ID;
  const UMA_RESOLVER_ADDRESS = umaResolver[DEFAULT_CHAIN_ID]?.address;

  // Compute marketId from claimStatement + endTime (only if past end)
  const marketId = React.useMemo(() => {
    if (!isPastEnd) return undefined;
    try {
      if (claimStatement && endTime) {
        const claimHex = toHex(claimStatement);
        const colonHex = toHex(':');
        const endTimeHex = toHex(BigInt(endTime), { size: 32 });
        const packed = concatHex([claimHex, colonHex, endTimeHex]);
        return keccak256(packed);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }, [claimStatement, endTime, isPastEnd]);

  // Query UMA resolver for settlement status (only when condition has ended)
  const { data: umaData, isLoading: umaLoading } = useReadContract({
    address: UMA_RESOLVER_ADDRESS,
    abi: umaWrappedMarketAbi,
    functionName: 'wrappedMarkets',
    args: marketId ? [marketId] : undefined,
    chainId: UMA_CHAIN_ID,
    query: { enabled: isPastEnd && Boolean(marketId && UMA_RESOLVER_ADDRESS) },
  });

  // If not past end time, show the regular prediction request
  if (!isPastEnd) {
    return <MarketPredictionRequest conditionId={conditionId} />;
  }

  // Past end time - show resolution status
  if (umaLoading) {
    return <span className="text-muted-foreground">Loading...</span>;
  }

  const tuple = umaData as
    | [boolean, boolean, boolean, `0x${string}`, number]
    | undefined;
  const resolved = Boolean(tuple?.[1]);
  const payout = Boolean(tuple?.[2]);

  if (!resolved) {
    return <span className="text-muted-foreground">Resolution Pending</span>;
  }

  // Resolved - show Yes or No
  return (
    <span className={payout ? 'text-yes font-medium' : 'text-no font-medium'}>
      Resolved: {payout ? 'Yes' : 'No'}
    </span>
  );
}

const ConditionRow: React.FC<ConditionRowProps> = ({ condition, color }) => {
  const { id, question, shortName, endTime, description } = condition;
  const { addParlaySelection, removeParlaySelection, parlaySelections } =
    useCreatePositionContext();

  const displayQ = shortName || question;

  // Determine selected state for this condition in parlay mode
  const selectionState = React.useMemo(() => {
    if (!id) return { selectedYes: false, selectedNo: false };
    const existing = parlaySelections.find((s) => s.conditionId === id);
    return {
      selectedYes: !!existing && existing.prediction === true,
      selectedNo: !!existing && existing.prediction === false,
    };
  }, [parlaySelections, id]);

  const handleYes = React.useCallback(() => {
    if (!id) return;
    const existing = parlaySelections.find((s) => s.conditionId === id);
    if (existing && existing.prediction === true) {
      removeParlaySelection(existing.id);
      return;
    }
    addParlaySelection({
      conditionId: id,
      question: displayQ,
      prediction: true,
      categorySlug: condition.category?.slug,
    });
  }, [
    id,
    displayQ,
    condition.category?.slug,
    parlaySelections,
    removeParlaySelection,
    addParlaySelection,
  ]);

  const handleNo = React.useCallback(() => {
    if (!id) return;
    const existing = parlaySelections.find((s) => s.conditionId === id);
    if (existing && existing.prediction === false) {
      removeParlaySelection(existing.id);
      return;
    }
    addParlaySelection({
      conditionId: id,
      question: displayQ,
      prediction: false,
      categorySlug: condition.category?.slug,
    });
  }, [
    id,
    displayQ,
    condition.category?.slug,
    parlaySelections,
    removeParlaySelection,
    addParlaySelection,
  ]);

  return (
    <div className="">
      <div className="bg-brand-black text-brand-white/90 flex flex-row items-stretch relative overflow-hidden transition-shadow duration-200 font-mono">
        <div
          className="absolute top-0 bottom-0 left-0 w-px"
          style={{ backgroundColor: color }}
        />
        <div className="flex-grow flex flex-col md:flex-row md:items-center md:justify-between px-4 py-3 md:py-3 md:pr-3 gap-3">
          <div className="flex items-center gap-3 flex-grow min-w-0">
            <MarketBadge
              label={displayQ}
              size={48}
              color={color}
              categorySlug={condition.category?.slug}
            />
            <div className="min-w-0 flex-grow">
              <h3 className="text-base leading-snug">
                <ConditionTitleLink
                  conditionId={id}
                  title={displayQ}
                  endTime={endTime}
                  description={description}
                  clampLines={1}
                />
              </h3>
              <div className="mt-2 text-sm text-foreground/70 flex items-center gap-1">
                <span>Current Forecast:</span>
                <ForecastCell
                  conditionId={id}
                  claimStatement={condition.claimStatement}
                  endTime={endTime}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end shrink-0 w-full md:w-auto">
            <YesNoSplitButton
              onYes={handleYes}
              onNo={handleNo}
              className="w-full md:min-w-[10rem]"
              size="sm"
              yesLabel="PREDICT YES"
              noLabel="PREDICT NO"
              selectedYes={selectionState.selectedYes}
              selectedNo={selectionState.selectedNo}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConditionRow;
