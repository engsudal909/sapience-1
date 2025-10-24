'use client';

import * as React from 'react';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import MarketBadge from '~/components/markets/MarketBadge';

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

const ConditionRow: React.FC<ConditionRowProps> = ({ condition, color }) => {
  const { id, question, shortName, endTime, description } = condition;
  const { addParlaySelection, removeParlaySelection, parlaySelections } =
    useBetSlipContext();

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
    });
  }, [
    id,
    displayQ,
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
    });
  }, [
    id,
    displayQ,
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
            <MarketBadge label={displayQ} size={48} color={color} />
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
                <MarketPredictionRequest conditionId={id} />
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
