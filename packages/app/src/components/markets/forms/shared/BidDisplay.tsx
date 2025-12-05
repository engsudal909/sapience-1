'use client';

import { useState, useMemo } from 'react';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { formatUnits, parseUnits } from 'viem';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { formatNumber } from '~/lib/utils/util';
import { quoteBidsToAuctionBids } from '~/lib/auction/bidAdapter';
import AuctionBidsChart from '~/components/shared/AuctionBidsChart';
import WagerDisclaimer from './WagerDisclaimer';

export interface BidDisplayProps {
  /** The best valid bid */
  bestBid: QuoteBid | null;
  /** User's wager amount (human-readable string) */
  wagerAmount: string;
  /** Collateral token symbol (e.g., "USDe") */
  collateralSymbol: string;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** Current time in ms for expiration calculation */
  nowMs: number;
  /** Whether we're waiting for bids */
  isWaitingForBids: boolean;
  /** Whether to show "Request Bids" button */
  showRequestBidsButton: boolean;
  /** Callback to request new bids */
  onRequestBids: () => void;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Submit handler */
  onSubmit: () => void;
  /** Whether submit is disabled (beyond bid expiration) */
  isSubmitDisabled?: boolean;
  /** Optional rainbow hover effect for high wagers */
  enableRainbowHover?: boolean;
  /** Optional "Limit Order" button handler */
  onLimitOrderClick?: () => void;
  /** Show parlay-specific "Some combinations may not receive bids" hint */
  showNoBidsHint?: boolean;
  /** Hint visibility for crossfade animation */
  hintVisible?: boolean;
  /** Disclaimer visibility for crossfade animation */
  disclaimerVisible?: boolean;
  /** Whether disclaimer is mounted */
  disclaimerMounted?: boolean;
  /** Whether hint is mounted */
  hintMounted?: boolean;
  /** Optional className for the container */
  className?: string;
  /** All bids for auction chart display */
  allBids?: QuoteBid[];
  /** Taker wager in wei for auction chart */
  takerWagerWei?: string;
  /** Taker address for auction chart */
  takerAddress?: string;
  /** Whether the "to win" section takes up space in the layout (default: true) */
  toWinTakesSpace?: boolean;
}

/**
 * Shared component for displaying bid information, payout, and submit button.
 * Used by both CreatePositionParlayForm and PredictionForm.
 */
export default function BidDisplay({
  bestBid,
  wagerAmount,
  collateralSymbol,
  collateralDecimals = 18,
  nowMs,
  isWaitingForBids,
  showRequestBidsButton,
  onRequestBids,
  isSubmitting,
  onSubmit,
  isSubmitDisabled = false,
  enableRainbowHover = false,
  onLimitOrderClick: _onLimitOrderClick,
  showNoBidsHint = false,
  hintVisible = false,
  disclaimerVisible = true,
  disclaimerMounted = true,
  hintMounted = false,
  className,
  allBids = [],
  takerWagerWei,
  takerAddress,
  toWinTakesSpace = true,
}: BidDisplayProps) {
  const [isAuctionExpanded, setIsAuctionExpanded] = useState(false);

  // Convert QuoteBids to AuctionBidData for the chart
  const chartBids = useMemo(() => quoteBidsToAuctionBids(allBids), [allBids]);
  // Calculate payout from best bid
  const { humanTotal, remainingSecs } = (() => {
    if (!bestBid) {
      return { humanTotal: '0.00', remainingSecs: 0 };
    }

    let userWagerWei: bigint = 0n;
    try {
      userWagerWei = parseUnits(wagerAmount || '0', collateralDecimals);
    } catch {
      userWagerWei = 0n;
    }

    const totalWei = (() => {
      try {
        return userWagerWei + BigInt(bestBid.makerWager);
      } catch {
        return 0n;
      }
    })();

    const humanTotalVal = (() => {
      try {
        const human = Number(formatUnits(totalWei, collateralDecimals));
        return formatNumber(human, 2);
      } catch {
        return '0.00';
      }
    })();

    const remainingMs = bestBid.makerDeadline * 1000 - nowMs;
    const secs = Math.max(0, Math.ceil(remainingMs / 1000));

    return { humanTotal: humanTotalVal, remainingSecs: secs };
  })();

  const _suffix = remainingSecs === 1 ? 'second' : 'seconds';
  const isBidExpired = bestBid
    ? bestBid.makerDeadline * 1000 - nowMs <= 0
    : true;

  // Determine button state and text
  const getButtonState = () => {
    if (bestBid) {
      return {
        text: isSubmitting ? 'SUBMITTING...' : 'SUBMIT PREDICTION',
        disabled: isSubmitting || isBidExpired || isSubmitDisabled,
        onClick: onSubmit,
        type: 'submit' as const,
      };
    }
    return {
      text: showRequestBidsButton ? 'INITIATE AUCTION' : 'WAITING FOR BIDS...',
      disabled: !showRequestBidsButton || isWaitingForBids,
      onClick: () => showRequestBidsButton && onRequestBids(),
      type: 'button' as const,
    };
  };

  const buttonState = getButtonState();

  return (
    <div
      className={`text-center ${toWinTakesSpace ? '' : 'relative'} ${className ?? ''}`}
    >
      {/* To Win Display - takes up space when toWinTakesSpace is true, otherwise positioned absolutely */}
      <div
        className={`mt-4 mb-4 transition-opacity duration-300 ${
          bestBid ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${toWinTakesSpace ? '' : 'absolute left-0 right-0 top-0 z-10'}`}
      >
        <div className="rounded-md border-[1.5px] border-ethena/80 bg-ethena/20 px-4 py-2.5 w-full shadow-[0_0_10px_rgba(136,180,245,0.25)]">
          <div className="flex items-center gap-1.5 min-h-[40px]">
            {/* Left column: To Win + View Auction */}
            <div className="flex flex-col gap-0 shrink-0">
              <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono">
                <span className="font-light text-brand-white uppercase tracking-wider">
                  To Win
                </span>
                <span className="text-brand-white font-semibold inline-flex items-center whitespace-nowrap">
                  {bestBid ? `${humanTotal} ${collateralSymbol}` : '—'}
                </span>
              </span>
              {/* View Auction Toggle - directly under To Win */}
              {allBids.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAuctionExpanded(!isAuctionExpanded)}
                  className="flex items-center gap-1 text-[10px] text-brand-white hover:text-brand-white/80 transition-colors"
                >
                  <span className="font-mono uppercase tracking-wide border-b border-dotted border-brand-white/50">
                    View Auction
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${
                      isAuctionExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              )}
            </div>
            {/* Right column: Expires countdown */}
            <div className="ml-auto font-mono text-right flex flex-col">
              <span className="whitespace-nowrap text-[10px] text-brand-white/70 uppercase tracking-wide leading-tight mb-0.5">
                Expires in
              </span>
              <span className="whitespace-nowrap text-brand-white text-sm font-semibold leading-tight">
                {bestBid ? `${remainingSecs}s` : '—'}
              </span>
            </div>
          </div>

          {/* Auction Chart - expandable */}
          {allBids.length > 0 && (
            <AnimatePresence initial={false}>
              {isAuctionExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="h-[160px] mt-3 mb-1">
                    <AuctionBidsChart
                      bids={chartBids}
                      continuous
                      refreshMs={90}
                      takerWager={takerWagerWei}
                      taker={takerAddress}
                      collateralAssetTicker={collateralSymbol}
                      showTooltips={true}
                      compact
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Submit / Request Bids Button */}
      <Button
        className={`w-full py-6 text-lg font-mono font-bold tracking-wider bg-brand-white text-brand-black hover:bg-brand-white/90 cursor-pointer disabled:cursor-not-allowed ${
          enableRainbowHover
            ? 'position-form-submit hover:text-brand-white'
            : ''
        }`}
        disabled={buttonState.disabled}
        type={buttonState.type}
        size="lg"
        variant="default"
        onClick={buttonState.onClick}
      >
        {buttonState.text}
      </Button>

      {/* Parlay-specific hint for combinations that may not receive bids */}
      {hintMounted && showNoBidsHint && (
        <div
          className={`text-xs text-foreground font-medium mt-2 transition-opacity duration-300 ${
            hintVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="text-accent-gold">
            Some combinations may not receive bids
          </span>
        </div>
      )}

      {/* Disclaimer with optional crossfade */}
      {disclaimerMounted && (
        <WagerDisclaimer
          className={`mt-4 transition-opacity duration-300 ${
            disclaimerVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
