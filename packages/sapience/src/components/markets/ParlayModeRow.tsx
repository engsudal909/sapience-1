'use client';

import * as React from 'react';
import { Dialog, DialogTrigger } from '@sapience/sdk/ui/components/ui/dialog';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import ConditionDialog from '~/components/markets/ConditionDialog';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';

export interface ParlayModeRowProps {
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

const ParlayModeRow: React.FC<ParlayModeRowProps> = ({ condition, color }) => {
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
    <div className="border-b last:border-b-0 border-border">
      <div className="bg-card border-muted flex flex-row transition-colors items-stretch relative">
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />
        <div className="flex-grow flex flex-col md:flex-row md:items-center md:justify-between px-5 py-4 md:py-3 md:pr-3 gap-3">
          <div className="flex-grow">
            <Dialog>
              <DialogTrigger asChild>
                <button type="button" className="text-left w-full">
                  <div className="text-xl">
                    <span className="underline decoration-1 decoration-foreground/10 underline-offset-4">
                      {question}
                    </span>
                  </div>
                </button>
              </DialogTrigger>
              <ConditionDialog
                conditionId={id}
                title={displayQ}
                endTime={endTime}
                description={description}
              />
            </Dialog>
            <div className="mt-2 text-sm text-muted-foreground flex items-center gap-1">
              <span className="text-muted-foreground">Market Prediction:</span>
              <MarketPredictionRequest conditionId={id} />
            </div>
          </div>
          <div className="flex items-center justify-end shrink-0 w-full md:w-auto">
            <YesNoSplitButton
              onYes={handleYes}
              onNo={handleNo}
              className="w-full md:min-w-[10rem]"
              size="lg"
              selectedYes={selectionState.selectedYes}
              selectedNo={selectionState.selectedNo}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParlayModeRow;
