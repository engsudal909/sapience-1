'use client';
import { type UseFormReturn } from 'react-hook-form';
import { Button } from '@/sapience/ui/index';

import BetslipParlayForm from './BetslipParlayForm';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

interface BetslipContentProps {
  isParlayMode: boolean;
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
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  // Collateral configuration from useSubmitParlay hook
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minWager?: string;
  // PredictionMarket contract address for fetching maker nonce
  predictionMarketAddress?: `0x${string}`;
}

export const BetslipContent = ({
  parlayMethods,
  handleParlaySubmit,
  isParlaySubmitting,
  parlayError,
  parlayChainId,
  bids = [],
  requestQuotes,
  collateralToken,
  collateralSymbol,
  collateralDecimals,
  minWager,
  predictionMarketAddress,
}: BetslipContentProps) => {
  const { parlaySelections, clearParlaySelections } = useBetSlipContext();
  const hasItems = parlaySelections.length > 0;

  return (
    <>
      <div className="w-full h-full flex flex-col">
        {hasItems && (
          <div className="relative px-4 pt-2 pb-2 lg:hidden">
            <div className="flex items-center justify-between">
              <h3 className="eyebrow text-foreground font-sans">
                Take a Position
              </h3>
              <Button
                variant="ghost"
                size="xs"
                className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 relative -top-0.5"
                onClick={clearParlaySelections}
                title="Reset"
              >
                CLEAR
              </Button>
            </div>
          </div>
        )}

        <div
          className={`flex-1 min-h-0 ${hasItems ? 'overflow-y-auto pb-4' : ''}`}
        >
          {parlaySelections.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-center">
              <div className="flex flex-col items-center gap-2 py-20">
                <p className="text-sm font-mono uppercase text-accent-gold max-w-[260px] mx-auto bg-transparent tracking-wide">
                  ADD PREDICTIONS TO SEE POTENTIAL WINNINGS
                </p>
              </div>
            </div>
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
      </div>
    </>
  );
};
