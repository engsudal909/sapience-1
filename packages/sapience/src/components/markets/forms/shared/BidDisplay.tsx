'use client';

import { Button } from '@sapience/sdk/ui/components/ui/button';
import { formatUnits, parseUnits } from 'viem';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { formatNumber } from '~/lib/utils/util';
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
}

/**
 * Shared component for displaying bid information, payout, and submit button.
 * Used by both BetslipParlayForm and PredictionForm.
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
}: BidDisplayProps) {
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

  const suffix = remainingSecs === 1 ? 'second' : 'seconds';
  const isBidExpired = bestBid
    ? bestBid.makerDeadline * 1000 - nowMs <= 0
    : true;

  if (bestBid) {
    return (
      <div className={`text-center ${className ?? ''}`}>
        {/* To Win Display */}
        <div className="mt-3 mb-4">
          <div className="flex items-center gap-1.5 rounded-md border-[1.5px] border-ethena/80 bg-ethena/20 px-4 py-2.5 w-full min-h-[40px] shadow-[0_0_10px_rgba(136,180,245,0.25)]">
            <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 font-mono">
              <span className="font-light text-brand-white uppercase tracking-wider">
                To Win
              </span>
              <span className="text-brand-white font-semibold inline-flex items-center whitespace-nowrap">
                {humanTotal} {collateralSymbol}
              </span>
            </span>
            <span className="ml-auto text-[10px] font-mono text-brand-white/70 text-right">
              <span className="whitespace-nowrap">Expires in</span>
              <br />
              <span className="whitespace-nowrap">
                {remainingSecs} {suffix}
              </span>
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <Button
          className={`w-full py-6 text-lg font-mono font-bold tracking-wider bg-brand-white text-brand-black hover:bg-brand-white/90 cursor-pointer disabled:cursor-not-allowed ${
            enableRainbowHover ? 'betslip-submit hover:text-brand-white' : ''
          }`}
          disabled={isSubmitting || isBidExpired || isSubmitDisabled}
          type="submit"
          size="lg"
          variant="default"
          onClick={onSubmit}
        >
          {isSubmitting ? 'SUBMITTING...' : 'SUBMIT PREDICTION'}
        </Button>

        <WagerDisclaimer className="mt-3" />
      </div>
    );
  }

  // No valid bid state
  return (
    <div className={`text-center ${className ?? ''}`}>
      {/* Request Bids / Waiting Button */}
      <Button
        className={`w-full py-6 text-lg font-mono font-bold tracking-wider bg-brand-white text-brand-black hover:bg-brand-white/90 cursor-pointer disabled:cursor-not-allowed ${
          enableRainbowHover ? 'betslip-submit hover:text-brand-white' : ''
        }`}
        disabled={!showRequestBidsButton || isWaitingForBids}
        type="button"
        size="lg"
        variant="default"
        onClick={() => showRequestBidsButton && onRequestBids()}
      >
        {showRequestBidsButton ? 'REQUEST BIDS' : 'WAITING FOR BIDS...'}
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
          className={`mt-3 transition-opacity duration-300 ${
            disclaimerVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
