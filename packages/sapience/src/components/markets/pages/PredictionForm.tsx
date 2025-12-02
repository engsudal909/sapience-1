'use client';

import * as React from 'react';
import { useMemo, useCallback } from 'react';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Label } from '@sapience/sdk/ui/components/ui/label';
import { useAccount } from 'wagmi';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { formatUnits, parseUnits } from 'viem';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import BidDisplay from '~/components/markets/forms/shared/BidDisplay';
import { useSingleConditionAuction } from '~/hooks/forms/useSingleConditionAuction';
import type {
  AuctionParams,
  QuoteBid,
  MintPredictionRequestData,
} from '~/lib/auction/useAuctionStart';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';

interface PredictionFormProps {
  /** The condition ID to bet on */
  conditionId: string;
  /** Chain ID for the prediction market */
  chainId: number;
  /** Collateral token address */
  collateralToken?: `0x${string}`;
  /** Collateral token symbol (e.g., "USDe") */
  collateralSymbol: string;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** Minimum wager amount (human-readable string) */
  minWager?: string;
  /** PredictionMarket contract address */
  predictionMarketAddress?: `0x${string}`;
  /** Bids from useAuctionStart */
  bids: QuoteBid[];
  /** Request quotes function from useAuctionStart */
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  /** Build mint request data from a bid */
  buildMintRequestDataFromBid?: (args: {
    selectedBid: QuoteBid;
    refCode?: `0x${string}`;
  }) => MintPredictionRequestData | null;
  /** Submit parlay function for minting */
  submitParlay?: (mintData: MintPredictionRequestData) => Promise<void>;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
  /** Optional className for the container */
  className?: string;
}

export default function PredictionForm({
  conditionId,
  chainId,
  collateralSymbol,
  collateralDecimals = 18,
  minWager,
  predictionMarketAddress,
  bids,
  requestQuotes,
  buildMintRequestDataFromBid,
  submitParlay,
  isSubmitting = false,
  className,
}: PredictionFormProps) {
  const [selectedPrediction, setSelectedPrediction] = React.useState<
    boolean | null
  >(true);
  const [wagerAmount, setWagerAmount] = React.useState('1');
  const { address: _address } = useAccount();
  const { hasConnectedWallet } = useConnectedWallet();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  const { toast } = useToast();

  // Use the shared auction hook for quote management
  const {
    bestBid,
    triggerQuoteRequest,
    isWaitingForBids,
    showRequestBidsButton,
    nowMs,
  } = useSingleConditionAuction({
    conditionId: selectedPrediction !== null ? conditionId : null,
    prediction: selectedPrediction,
    wagerAmount,
    chainId,
    collateralDecimals,
    predictionMarketAddress,
    bids,
    requestQuotes,
  });

  // Derive current forecast from best bid odds
  // Implied probability = makerWager / (userWager + makerWager)
  const currentForecast = useMemo(() => {
    if (!bestBid) return null;

    try {
      const makerWagerWei = BigInt(bestBid.makerWager);
      // For a Yes prediction, the maker is betting against (paying out if Yes wins)
      // The implied probability of Yes = userWager / totalPayout
      // But we need to consider the prediction direction

      // Parse user's wager
      const userWagerNum = parseFloat(wagerAmount || '0');
      const makerWagerNum = Number(
        formatUnits(makerWagerWei, collateralDecimals)
      );
      const totalPayout = userWagerNum + makerWagerNum;

      if (totalPayout <= 0) return null;

      // If user bets Yes, implied probability of Yes = userWager / totalPayout
      // If user bets No, implied probability of No = userWager / totalPayout
      // So implied probability of Yes when betting No = 1 - (userWager / totalPayout)
      const impliedProb = userWagerNum / totalPayout;

      if (selectedPrediction === true) {
        // Betting Yes: implied Yes probability
        return Math.round(impliedProb * 100);
      } else if (selectedPrediction === false) {
        // Betting No: implied Yes probability is the complement
        return Math.round((1 - impliedProb) * 100);
      }

      return null;
    } catch {
      return null;
    }
  }, [bestBid, wagerAmount, collateralDecimals, selectedPrediction]);

  // Handle submission
  const handleSubmit = useCallback(() => {
    if (!hasConnectedWallet) {
      try {
        connectOrCreateWallet();
      } catch (error) {
        console.error('connectOrCreateWallet failed', error);
      }
      return;
    }

    if (!bestBid || !buildMintRequestDataFromBid || !submitParlay) {
      toast({
        title: 'Unable to submit',
        description: 'No valid bid available. Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    // Check if bid is expired
    const nowSec = Math.floor(Date.now() / 1000);
    if (bestBid.makerDeadline <= nowSec) {
      toast({
        title: 'Bid expired',
        description: 'The bid has expired. Please request new bids.',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    try {
      const mintReq = buildMintRequestDataFromBid({
        selectedBid: bestBid,
      });

      if (mintReq) {
        submitParlay(mintReq);
      } else {
        toast({
          title: 'Unable to submit',
          description: 'Could not prepare prediction data. Please try again.',
          variant: 'destructive',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast({
        title: 'Submission error',
        description: 'An error occurred while submitting your prediction.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  }, [
    hasConnectedWallet,
    connectOrCreateWallet,
    bestBid,
    buildMintRequestDataFromBid,
    submitParlay,
    toast,
  ]);

  // Handle Yes/No selection
  const handleYes = useCallback(() => {
    setSelectedPrediction(true);
  }, []);

  const handleNo = useCallback(() => {
    setSelectedPrediction(false);
  }, []);

  // Handle request bids
  const handleRequestBids = useCallback(() => {
    triggerQuoteRequest({ forceRefresh: true });
  }, [triggerQuoteRequest]);

  // Determine if we should show the bid display (user has made a selection)
  const showBidDisplay = selectedPrediction !== null;

  // Validate wager amount
  const wagerNum = parseFloat(wagerAmount || '0');
  const minWagerNum = parseFloat(minWager || '0');
  const isWagerValid = wagerNum >= minWagerNum && wagerNum > 0;

  // Compute taker wager in wei for auction chart
  const takerWagerWei = useMemo(() => {
    try {
      return parseUnits(wagerAmount || '0', collateralDecimals).toString();
    } catch {
      return '0';
    }
  }, [wagerAmount, collateralDecimals]);

  return (
    <div
      className={`min-h-[350px] border border-border rounded-lg bg-brand-black p-4 flex flex-col ${className ?? ''}`}
    >
      <div className="flex flex-col gap-3 flex-1">
        {/* Current Forecast Display */}
        <div className="flex flex-col items-start gap-1">
          <Label className="text-brand-white">Current Forecast</Label>
          <span className="font-mono text-ethena text-3xl">
            {currentForecast !== null ? `${currentForecast}% chance` : '—'}
          </span>
        </div>

        {/* Select Prediction */}
        <div className="space-y-2 mb-3">
          <Label className="text-brand-white">Select Prediction</Label>
          <div className="font-mono">
            <YesNoSplitButton
              onYes={handleYes}
              onNo={handleNo}
              selectedYes={selectedPrediction === true}
              selectedNo={selectedPrediction === false}
              size="md"
              yesLabel="YES"
              noLabel="NO"
              labelClassName="text-base"
            />
          </div>
        </div>

        {/* Wager Input */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="wagerAmount-input" className="text-brand-white">
              Wager Amount
            </Label>
          </div>
          <div className="relative">
            <Input
              id="wagerAmount-input"
              type="text"
              inputMode="decimal"
              value={wagerAmount}
              onChange={(e) => {
                // Allow only numbers and a single decimal point
                const value = e.target.value;
                const cleanedValue = value.replace(/[^0-9.]/g, '');
                const parts = cleanedValue.split('.');
                let finalValue = cleanedValue;
                if (parts.length > 2) {
                  finalValue = `${parts[0]}.${parts.slice(1).join('')}`;
                }
                setWagerAmount(finalValue);
              }}
              placeholder="0.00"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoCapitalize="none"
              className="pr-16 text-brand-white placeholder:text-brand-white/70"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-white flex items-center pointer-events-none">
              {collateralSymbol}
            </div>
          </div>
        </div>
      </div>

      {/* Bid Display / Submit Section */}
      {showBidDisplay && isWagerValid ? (
        <BidDisplay
          bestBid={bestBid}
          wagerAmount={wagerAmount}
          collateralSymbol={collateralSymbol}
          collateralDecimals={collateralDecimals}
          nowMs={nowMs}
          isWaitingForBids={isWaitingForBids}
          showRequestBidsButton={showRequestBidsButton}
          onRequestBids={handleRequestBids}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          className="mt-auto"
          allBids={bids}
          takerWagerWei={takerWagerWei}
          takerAddress={_address}
        />
      ) : (
        <div className="mt-auto pt-4 text-center text-sm text-muted-foreground">
          {!selectedPrediction
            ? 'Select Yes or No to make a prediction'
            : !isWagerValid
              ? `Minimum wager: ${minWager || '0'} ${collateralSymbol}`
              : ''}
        </div>
      )}
    </div>
  );
}
