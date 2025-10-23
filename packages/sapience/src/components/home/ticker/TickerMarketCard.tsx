'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';

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

const TickerMarketCard: React.FC<TickerMarketCardProps> = ({ condition }) => {
  const { id, question, shortName, endTime, description } = condition;
  const { addParlaySelection, removeParlaySelection, parlaySelections } =
    useBetSlipContext();
  const router = useRouter();

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
    router.push('/markets');
  }, [
    id,
    displayQ,
    parlaySelections,
    removeParlaySelection,
    addParlaySelection,
    router,
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
    router.push('/markets');
  }, [
    id,
    displayQ,
    parlaySelections,
    removeParlaySelection,
    addParlaySelection,
    router,
  ]);

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
            <div className="px-4 pt-1 pb-2">
              <h3 className="text-base leading-snug min-w-0">
                <ConditionTitleLink
                  conditionId={id}
                  title={displayQ}
                  endTime={endTime}
                  description={description}
                  clampLines={2}
                />
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
