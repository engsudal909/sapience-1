'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import * as React from 'react';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import type { MarketWithContext } from './MarketsPage';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { getChainShortName } from '~/lib/utils/util';
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { DEFAULT_WAGER_AMOUNT } from '~/lib/utils/betslipUtils';
import { useSettings } from '~/lib/context/SettingsContext';

export interface MarketCardProps {
  chainId: number;
  marketAddress: string;
  market: MarketWithContext;
  yesMarketId?: number;
  noMarketId?: number;
  color?: string;
  displayQuestion: string;
  isActive?: boolean;
  marketClassification?: MarketGroupClassification;
  displayUnit?: string;
}

const MarketCard = ({
  chainId,
  marketAddress,
  market,
  yesMarketId,
  noMarketId,
  color,
  displayQuestion,
  isActive,
  marketClassification,
  displayUnit,
}: MarketCardProps) => {
  const { addPosition, singlePositions } = useBetSlipContext();
  const router = useRouter();
  const { showAmericanOdds } = useSettings();

  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId]
  );

  const marketIds = React.useMemo(() => [market.marketId], [market.marketId]);

  const { chartData, isLoading: isLoadingChartData } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
  });

  const latestPrices = React.useMemo(() => {
    if (chartData.length === 0) return {} as Record<number, number>;

    const latestDataPoint = chartData[chartData.length - 1];
    const prices: Record<number, number> = {};

    if (latestDataPoint.markets) {
      Object.entries(latestDataPoint.markets).forEach(
        ([marketIdStr, value]) => {
          if (typeof value === 'number') {
            // Values are already scaled to base units (0-1 for prob, numeric already in display units)
            prices[parseInt(marketIdStr)] = value;
          }
        }
      );
    }

    return prices;
  }, [chartData]);

  const formatPriceAsPercentage = (price: number) => {
    if (!Number.isFinite(price)) return 'Price N/A';
    const percentage = Math.max(0, Math.min(100, price * 100));
    if (percentage < 1) return '<1% chance';
    return `${Math.round(percentage)}% chance`;
  };

  // Helper function to handle adding market to bet slip
  const handleAddToBetSlip = (
    marketItem: MarketWithContext,
    prediction?: boolean,
    classificationOverride?: MarketGroupClassification
  ) => {
    const position = {
      prediction: typeof prediction === 'boolean' ? prediction : true,
      marketAddress,
      marketId: marketItem.marketId,
      question: marketItem.question || marketItem.optionName || displayQuestion,
      chainId,
      marketClassification: classificationOverride || marketClassification,
      wagerAmount: DEFAULT_WAGER_AMOUNT,
    };
    addPosition(position);
  };

  // Handler for Yes button
  const handleYesClick = () => {
    const targetId =
      typeof yesMarketId === 'number' ? yesMarketId : market.marketId;
    const yesMarket = {
      ...market,
      marketId: targetId,
      optionName: 'Yes',
    } as MarketWithContext;
    handleAddToBetSlip(yesMarket, true);
    router.push('/markets#spot');
  };

  // Handler for No button
  const handleNoClick = () => {
    const targetId =
      typeof noMarketId === 'number' ? noMarketId : market.marketId;
    const noMkt = {
      ...market,
      marketId: targetId,
      optionName: 'No',
    } as MarketWithContext;
    handleAddToBetSlip(noMkt, false);
    router.push('/markets#spot');
  };

  const MarketPrediction = () => {
    if (!isActive) return null;

    const currentPrice = latestPrices[market.marketId] || 0;

    if (currentPrice > 0) {
      if (marketClassification === MarketGroupClassificationEnum.NUMERIC) {
        return (
          <span className="font-medium text-foreground">
            {currentPrice.toFixed(2)}
            {displayUnit && <span className="ml-1">{displayUnit}</span>}
          </span>
        );
      } else {
        return (
          <span className="font-medium text-foreground">
            {formatPriceAsPercentage(currentPrice)}
          </span>
        );
      }
    }

    return (
      <span className="text-foreground">
        {isLoadingChartData ? 'Loading...' : 'No wagers yet'}
      </span>
    );
  };

  const canShowPredictionElement = isActive;

  // Compute selected state for YES/NO (singles mode) and for each option in multichoice
  const yesNoSelection = React.useMemo(() => {
    if (marketClassification !== MarketGroupClassificationEnum.YES_NO) {
      return { selectedYes: false, selectedNo: false };
    }
    const existing = singlePositions.find(
      (p) =>
        p.marketAddress === marketAddress &&
        p.marketClassification === MarketGroupClassificationEnum.YES_NO
    );
    return {
      selectedYes: !!existing && existing.prediction === true,
      selectedNo: !!existing && existing.prediction === false,
    };
  }, [singlePositions, marketAddress, marketClassification]);

  // Convert probability (0-1) to American odds string
  const toAmericanOdds = React.useCallback((prob: number | undefined) => {
    const p = typeof prob === 'number' ? prob : 0;
    if (!(p > 0) || !(p < 1)) return undefined;
    if (p > 0.5) {
      const val = Math.round((p / (1 - p)) * 100);
      return `-${val}`;
    }
    const val = Math.round(((1 - p) / p) * 100);
    return `+${val}`;
  }, []);

  // Compute Yes/No odds text when applicable
  const yesNoOdds = React.useMemo(() => {
    if (
      !isActive ||
      marketClassification !== MarketGroupClassificationEnum.YES_NO
    ) {
      return {
        yesOddsText: undefined as string | undefined,
        noOddsText: undefined as string | undefined,
      };
    }
    const resolvedYesId =
      typeof yesMarketId === 'number'
        ? yesMarketId
        : market.optionName === 'Yes'
          ? market.marketId
          : undefined;
    let p: number | undefined = undefined;
    if (typeof resolvedYesId === 'number') {
      p = latestPrices[resolvedYesId];
    } else if (typeof latestPrices[market.marketId] === 'number') {
      const base = latestPrices[market.marketId];
      p =
        market.optionName === 'No'
          ? typeof base === 'number'
            ? 1 - base
            : undefined
          : base;
    }
    return {
      yesOddsText: toAmericanOdds(p),
      noOddsText: toAmericanOdds(typeof p === 'number' ? 1 - p : undefined),
    };
  }, [
    isActive,
    marketClassification,
    market,
    yesMarketId,
    latestPrices,
    toAmericanOdds,
  ]);

  // No group-level selection; operate on the single provided market

  // Slightly increase bottom padding for YES/NO markets so buttons don't sit too low
  const bottomPaddingClass = React.useMemo(
    () =>
      marketClassification === MarketGroupClassificationEnum.YES_NO
        ? 'pb-5'
        : 'pb-4',
    [marketClassification]
  );

  return (
    <div className="w-full h-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="bg-brand-black text-brand-white/90 rounded-b-none rounded-t-lg border border-brand-white/10 flex flex-row items-stretch h-full md:min-h-[160px] relative overflow-hidden shadow-sm transition-shadow duration-200 font-mono"
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 flex flex-col h-full">
          <div className="block group">
            <div className="transition-colors">
              <div className="flex flex-col px-4 py-3 gap-3">
                <div className="flex flex-col min-w-0 flex-1">
                  <h3 className="leading-snug min-h-[44px] min-w-0">
                    <Link
                      href={`/markets/${chainShortName}:${marketAddress}`}
                      className="group"
                    >
                      <span
                        className="font-mono text-brand-white underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 transition-colors block overflow-hidden group-hover:decoration-brand-white/80"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {displayQuestion}
                      </span>
                    </Link>
                  </h3>
                  {/* Market Prediction moved to bottom action section */}
                </div>
              </div>
            </div>
          </div>

          <div className={`mt-auto px-4 pt-0 ${bottomPaddingClass}`}>
            <div
              className="text-sm text-foreground/70 w-full mb-3"
              style={{
                visibility: canShowPredictionElement ? 'visible' : 'hidden',
              }}
            >
              <div className="truncate whitespace-nowrap min-w-0 h-5 flex items-center gap-1">
                <span>Current Forecast:</span>
                <MarketPrediction />
              </div>
            </div>
            {isActive &&
              marketClassification === MarketGroupClassificationEnum.YES_NO && (
                <YesNoSplitButton
                  onYes={handleYesClick}
                  onNo={handleNoClick}
                  className="w-full"
                  size="sm"
                  yesLabel="PREDICT YES"
                  noLabel="PREDICT NO"
                  selectedYes={yesNoSelection.selectedYes}
                  selectedNo={yesNoSelection.selectedNo}
                  yesOddsText={
                    showAmericanOdds ? yesNoOdds.yesOddsText : undefined
                  }
                  noOddsText={
                    showAmericanOdds ? yesNoOdds.noOddsText : undefined
                  }
                />
              )}
            {isActive &&
              marketClassification ===
                MarketGroupClassificationEnum.MULTIPLE_CHOICE && (
                <YesNoSplitButton
                  onYes={() => {
                    handleAddToBetSlip(
                      market,
                      true,
                      MarketGroupClassificationEnum.YES_NO
                    );
                    router.push('/markets#spot');
                  }}
                  onNo={() => {
                    handleAddToBetSlip(
                      market,
                      false,
                      MarketGroupClassificationEnum.YES_NO
                    );
                    router.push('/markets#spot');
                  }}
                  className="w-full"
                  size="sm"
                  yesLabel="PREDICT YES"
                  noLabel="PREDICT NO"
                  yesOddsText={
                    showAmericanOdds
                      ? toAmericanOdds(latestPrices[market.marketId])
                      : undefined
                  }
                  noOddsText={
                    showAmericanOdds
                      ? toAmericanOdds(
                          typeof latestPrices[market.marketId] === 'number'
                            ? 1 - latestPrices[market.marketId]
                            : undefined
                        )
                      : undefined
                  }
                />
              )}
            {!isActive && (
              <Button
                variant="secondary"
                className="w-full md:min-w-[10rem]"
                size="lg"
                asChild
              >
                <Link
                  href={`/markets/${chainShortName}:${marketAddress}`}
                  className="group inline-flex items-center"
                >
                  CLOSED
                </Link>
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default MarketCard;
