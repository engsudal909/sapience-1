'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogTrigger } from '@sapience/sdk/ui/components/ui/dialog';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import ConditionDialog from '~/components/markets/ConditionDialog';

export interface TickerMarketCardProps {
  condition: {
    id?: string;
    question: string;
    shortName?: string | null;
    endTime?: number | null;
    description?: string | null;
  };
  color: string;
}

const TickerMarketCard: React.FC<TickerMarketCardProps> = ({ condition, color }) => {
  const { id, question, shortName, endTime, description } = condition;
  const { addParlaySelection, removeParlaySelection, parlaySelections } = useBetSlipContext();

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
  }, [id, displayQ, parlaySelections, removeParlaySelection, addParlaySelection]);

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
  }, [id, displayQ, parlaySelections, removeParlaySelection, addParlaySelection]);

  return (
    <div className="w-auto max-w-[85vw] md:max-w-[640px] font-mono">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-row items-stretch relative overflow-hidden"
      >
        <div className="flex-1 flex flex-col">
          <div className="group">
            <div className="px-4 pt-1 pb-0">
              <h3 className="text-base leading-snug">
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className="text-left w-full">
                      <span
                        className="text-brand-white underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 transition-colors block overflow-hidden group-hover:decoration-brand-white/80"
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
          <div className="mt-auto px-4 pb-1">
            <div className="text-sm text-foreground/70 w-full mb-3">
              <div className="truncate whitespace-nowrap min-w-0 h-5 flex items-center gap-1">
                <span className="">Current Forecast:</span>
                <MarketPredictionRequest conditionId={id} className="" />
              </div>
            </div>
            <YesNoSplitButton
              onYes={handleYes}
              onNo={handleNo}
              className=""
              size="sm"
              fullWidth
              selectedYes={selectionState.selectedYes}
              selectedNo={selectionState.selectedNo}
              yesLabel="PREDICT YES"
              noLabel="PREDICT NO"
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default TickerMarketCard;


