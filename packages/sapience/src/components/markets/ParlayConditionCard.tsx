'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogTrigger } from '@sapience/sdk/ui/components/ui/dialog';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import ConditionDialog from '~/components/markets/ConditionDialog';

export interface ParlayConditionCardProps {
  condition: {
    id?: string;
    question: string;
    shortName?: string | null;
    endTime?: number | null;
    description?: string | null;
  };
  color: string;
}

const ParlayConditionCard: React.FC<ParlayConditionCardProps> = ({
  condition,
  color,
}) => {
  const { id, question, shortName, endTime, description } = condition;
  const { addParlaySelection, removeParlaySelection, parlaySelections } =
    useBetSlipContext();

  const displayQ = shortName || question;

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

  // Prediction requests are handled by <MarketPredictionRequest />; no local
  // auction/nonce state is required here.

  return (
    <div className="w-full h-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="bg-card border rounded-md border-border/70 flex flex-row items-stretch h-full md:min-h-[100px] relative overflow-hidden shadow-sm transition-shadow duration-200"
      >
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />
        <div className="flex-1 flex flex-col h-full">
          <div className="block group">
            <div className="transition-colors">
              <div className="flex flex-col px-4 py-3 gap-2">
                <div className="flex flex-col min-w-0 flex-1">
                  <h3 className="text-base leading-snug min-h-[44px]">
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" className="text-left w-full">
                          <span
                            className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors block overflow-hidden group-hover:decoration-foreground/60"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {displayQ}
                          </span>
                        </button>
                      </DialogTrigger>
                      <ConditionDialog
                        conditionId={id}
                        title={displayQ}
                        endTime={endTime}
                        description={description}
                      />
                    </Dialog>
                  </h3>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-auto px-4 pt-0 pb-4">
            <div className="text-sm text-muted-foreground w-full mb-3">
              <div className="truncate whitespace-nowrap min-w-0 h-5 flex items-center gap-1">
                <span className="text-muted-foreground">
                  Market Prediction:
                </span>
                <MarketPredictionRequest conditionId={id} className="" />
              </div>
            </div>
            <YesNoSplitButton
              onYes={handleYes}
              onNo={handleNo}
              className="w-full"
              size="sm"
              selectedYes={selectionState.selectedYes}
              selectedNo={selectionState.selectedNo}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ParlayConditionCard;
