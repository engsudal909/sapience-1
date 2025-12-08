'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
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
  /** Show position-specific "Some combinations may not receive bids" hint */
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
  /** Validation error message to show instead of placeholder */
  validationError?: string;
}

/**
 * Shared component for displaying bid information, payout, and submit button.
 * Used by both PositionForm and PredictionForm.
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
  validationError,
}: BidDisplayProps) {
  const [isAuctionExpanded, setIsAuctionExpanded] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<
    'idle' | 'sliding-up' | 'sliding-down'
  >('idle');
  const [showToWin, setShowToWin] = useState(false);
  const [isRefreshingBid, setIsRefreshingBid] = useState(false);
  const prevBestBidRef = useRef<QuoteBid | null>(null);

  // Detect when bestBid appears or changes and trigger animation
  useEffect(() => {
    const prevBid = prevBestBidRef.current;

    // Only process if bestBid actually changed
    if (bestBid === prevBid) {
      return;
    }

    const isNewBid = bestBid && !prevBid;
    const isBetterBid =
      bestBid &&
      prevBid &&
      (bestBid.makerWager !== prevBid.makerWager ||
        bestBid.makerDeadline !== prevBid.makerDeadline);

    // Update ref immediately to prevent double-triggering
    prevBestBidRef.current = bestBid;

    if (isNewBid) {
      // Bid just appeared for the first time - start animation sequence
      setAnimationPhase('sliding-up');
      // After button slides up, transition to sliding down
      const timer1 = setTimeout(() => {
        setShowToWin(true);
        setAnimationPhase('sliding-down');
      }, 300); // Match the faster slide-up duration
      // After slide down completes, reset to idle
      const timer2 = setTimeout(() => {
        setAnimationPhase('idle');
      }, 600); // Total animation duration (faster)
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else if (isBetterBid) {
      // Better bid came in - just fade out and fade back in "To Win" component
      // Make sure button doesn't animate by keeping animationPhase as 'idle'
      setAnimationPhase('idle');
      setIsRefreshingBid(true);
      // After fade out, fade back in
      const timer1 = setTimeout(() => {
        setIsRefreshingBid(false);
      }, 200); // Fade out duration
      return () => {
        clearTimeout(timer1);
      };
    } else if (!bestBid) {
      // Bid disappeared - reset state
      setShowToWin(false);
      setAnimationPhase('idle');
      setIsRefreshingBid(false);
    }
  }, [bestBid]);

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
      <AnimatePresence mode="wait">
        {bestBid &&
        (showToWin ||
          animationPhase === 'sliding-down' ||
          prevBestBidRef.current) ? (
          <motion.div
            key={`to-win-${bestBid.makerWager}-${bestBid.makerDeadline}-${isRefreshingBid ? 'fade-out' : 'fade-in'}`}
            initial={
              isRefreshingBid
                ? { opacity: 1 }
                : { opacity: 0, y: -10, scale: 0.98 }
            }
            animate={{
              opacity: isRefreshingBid ? 0 : 1,
              y: 0,
              scale: 1,
            }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={
              isRefreshingBid
                ? {
                    opacity: { duration: 0.2, ease: [0.4, 0.1, 0.25, 1] },
                  }
                : {
                    opacity: {
                      duration: 0.4,
                      delay: 0.2,
                      ease: [0.25, 0.1, 0.25, 1],
                    },
                    y: {
                      type: 'spring',
                      stiffness: 400,
                      damping: 25,
                      mass: 0.6,
                      delay: 0.2,
                    },
                    scale: {
                      type: 'spring',
                      stiffness: 500,
                      damping: 30,
                      mass: 0.5,
                      delay: 0.2,
                    },
                  }
            }
            className={`mt-4 mb-6 ${toWinTakesSpace ? '' : 'absolute left-0 right-0 top-0 z-10'}`}
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
          </motion.div>
        ) : !bestBid || animationPhase === 'sliding-up' ? (
          <motion.div
            key="filler"
            initial={{ opacity: 1 }}
            animate={{ opacity: animationPhase === 'sliding-up' ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0.1, 0.25, 1] }}
            className="mt-4 mb-6 min-h-[40px] px-4 py-2.5"
          >
            <div
              className={`text-xs text-center ${
                validationError
                  ? 'text-destructive'
                  : 'text-muted-foreground/50'
              }`}
            >
              {validationError ||
                'An auction bid will appear here once a counterparty responds to an initialized auction request'}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Submit / Request Bids Button */}
      <motion.div
        className="mt-2"
        animate={{
          y: animationPhase === 'sliding-up' ? -80 : 0,
        }}
        transition={
          animationPhase === 'idle' || isRefreshingBid
            ? { duration: 0 }
            : animationPhase === 'sliding-up'
              ? {
                  duration: 0.3,
                  ease: [0.4, 0.1, 0.25, 1], // Strong ease-in
                }
              : {
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                  mass: 0.6,
                }
        }
      >
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
      </motion.div>

      {/* Position-specific hint for combinations that may not receive bids */}
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
