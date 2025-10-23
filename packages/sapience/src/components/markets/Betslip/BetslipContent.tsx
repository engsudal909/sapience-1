'use client';
import { type UseFormReturn } from 'react-hook-form';
import { Button } from '@/sapience/ui/index';
import Image from 'next/image';

import BetslipSinglesForm from './BetslipSinglesForm';
import BetslipParlayForm from './BetslipParlayForm';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

interface BetslipContentProps {
  isParlayMode: boolean;
  onParlayModeChange?: (enabled: boolean) => void;
  individualMethods: UseFormReturn<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  parlayMethods: UseFormReturn<{
    wagerAmount: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  handleIndividualSubmit: () => void;
  handleParlaySubmit: () => void;
  isParlaySubmitting: boolean;
  parlayError?: string | null;
  isSubmitting: boolean;
  parlayChainId?: number;
  // Auction integration (provided by parent to share a single WS connection)
  auctionId?: string | null;
  bids?: QuoteBid[];
  requestQuotes?: (params: AuctionParams | null) => void;
  // Collateral configuration from useSubmitParlay hook
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minWager?: string;
  // PredictionMarket contract address for fetching maker nonce
  predictionMarketAddress?: `0x${string}`;
}

export const BetslipContent = ({
  isParlayMode,
  individualMethods,
  parlayMethods,
  handleIndividualSubmit,
  handleParlaySubmit,
  isParlaySubmitting,
  parlayError,
  isSubmitting,
  parlayChainId,
  bids = [],
  requestQuotes,
  collateralToken,
  collateralSymbol,
  collateralDecimals,
  minWager,
  predictionMarketAddress,
}: BetslipContentProps) => {
  const {
    betSlipPositions,
    clearBetSlip,
    parlaySelections,
    clearParlaySelections,
  } = useBetSlipContext();
  const effectiveParlayMode = isParlayMode;

  // Note: RFQ quote request logic is now handled inside BetslipParlayForm
  // This was moved to reduce prop drilling and keep related logic together

  return (
    <>
      <div className="w-full h-full flex flex-col">
        <div className="relative px-4 pt-2 pb-2 lg:hidden">
          <div className="flex items-center justify-between">
            <h3 className="eyebrow text-foreground font-sans">
              Make a Prediction
            </h3>
            {(effectiveParlayMode
              ? parlaySelections.length > 0
              : betSlipPositions.length > 0) && (
              <Button
                variant="ghost"
                size="xs"
                className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 border border-border rounded-sm"
                onClick={
                  effectiveParlayMode ? clearParlaySelections : clearBetSlip
                }
                title="Reset"
              >
                CLEAR
              </Button>
            )}
          </div>
        </div>

        <div
          className={`flex-1 min-h-0 ${
            betSlipPositions.length === 0 ? '' : 'overflow-y-auto'
          }`}
        >
          {(
            effectiveParlayMode
              ? parlaySelections.length === 0
              : betSlipPositions.length === 0
          ) ? (
            <div className="w-full h-full flex items-center justify-center text-center text-brand-white">
              <div className="flex flex-col items-center gap-2 py-20">
                <Image src="/usde.svg" alt="USDe" width={42} height={42} />
                <p className="text-base text-brand-white/90 max-w-[200px] mx-auto bg-transparent">
                  {'Add predictions to see your potential winnings'}
                </p>
                {/* Parlay mode toggle removed from betslip empty state */}
              </div>
            </div>
          ) : !effectiveParlayMode ? (
            <BetslipSinglesForm
              methods={individualMethods}
              onSubmit={handleIndividualSubmit}
              isSubmitting={isSubmitting}
            />
          ) : (
            <BetslipParlayForm
              methods={parlayMethods}
              onSubmit={handleParlaySubmit}
              isSubmitting={isParlaySubmitting}
              error={parlayError}
              chainId={parlayChainId}
              bids={bids}
              requestQuotes={requestQuotes}
              collateralToken={collateralToken}
              collateralSymbol={collateralSymbol}
              collateralDecimals={collateralDecimals}
              minWager={minWager}
              predictionMarketAddress={predictionMarketAddress}
            />
          )}
        </div>
        {/* Footer actions removed as Clear all is now in the header */}
      </div>
    </>
  );
};
