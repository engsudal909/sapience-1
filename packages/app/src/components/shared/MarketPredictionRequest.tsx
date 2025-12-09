'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { predictionMarket } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import {
  buildAuctionStartPayload,
  type PredictedOutcomeInputStub,
} from '~/lib/auction/buildAuctionPayload';
import PercentChance from '~/components/shared/PercentChance';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
// Use one as the default wager for prediction requests

export interface MarketPredictionRequestProps {
  conditionId?: string;
  outcomes?: PredictedOutcomeInputStub[];
  onPrediction?: (probability: number) => void;
  className?: string;
  inline?: boolean;
  eager?: boolean;
  suppressLoadingPlaceholder?: boolean;
  prefetchedProbability?: number | null;
  skipViewportCheck?: boolean;
}

const MarketPredictionRequest: React.FC<MarketPredictionRequestProps> = ({
  conditionId,
  outcomes,
  onPrediction,
  className,
  inline = true,
  eager = true,
  suppressLoadingPlaceholder = false,
  prefetchedProbability = null,
  skipViewportCheck = false,
}) => {
  const [requestedPrediction, setRequestedPrediction] = React.useState<
    number | null
  >(null);
  const [isRequesting, setIsRequesting] = React.useState<boolean>(false);
  const [lastTakerWagerWei, setLastTakerWagerWei] = React.useState<
    string | null
  >(null);
  const [queuedRequest, setQueuedRequest] = React.useState<boolean>(false);

  const { address: takerAddress } = useAccount();
  const { requestQuotes, bids } = useAuctionStart();
  const chainId = useChainIdFromLocalStorage();
  const PREDICTION_MARKET_ADDRESS =
    predictionMarket[chainId]?.address ||
    predictionMarket[DEFAULT_CHAIN_ID]?.address;
  const ZERO_ADDRESS =
    '0x0000000000000000000000000000000000000000' as `0x${string}`;

  const eagerlyRequestedRef = React.useRef<boolean>(false);
  const eagerJitterMsRef = React.useRef<number>(
    Math.floor(Math.random() * 301)
  );

  // Track viewport visibility to trigger eager load only when visible
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [isInViewport, setIsInViewport] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!eager) return;
    if (skipViewportCheck) {
      setIsInViewport(true);
      return;
    }
    const target = rootRef.current;
    if (!target) return;

    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) {
            setIsInViewport(true);
            observer?.disconnect();
          }
        },
        { root: null, rootMargin: '0px', threshold: 0.01 }
      );
      observer.observe(target);
    } catch {
      // If IntersectionObserver is unavailable, fall back to allowing eager
      setIsInViewport(true);
    }

    return () => observer?.disconnect();
  }, [eager, skipViewportCheck]);

  // Prefer connected wallet address; fall back to zero address
  const selectedTakerAddress = takerAddress || ZERO_ADDRESS;

  // If we have a prefetched probability (e.g., fetched offscreen), set it and
  // skip further requests.
  React.useEffect(() => {
    if (prefetchedProbability == null) return;
    setRequestedPrediction(prefetchedProbability);
    setIsRequesting(false);
    setQueuedRequest(false);
  }, [prefetchedProbability]);

  const { data: takerNonce } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: selectedTakerAddress ? [selectedTakerAddress] : undefined,
    chainId: chainId,
    query: { enabled: !!selectedTakerAddress && !!PREDICTION_MARKET_ADDRESS },
  });

  // unified via PercentChance component

  React.useEffect(() => {
    if (!isRequesting) return;
    if (!bids || bids.length === 0) return;
    try {
      const nowMs = Date.now();
      const valid = bids.filter((b) => {
        try {
          const dl = Number(b?.makerDeadline || 0);
          return Number.isFinite(dl) ? dl * 1000 > nowMs : true;
        } catch {
          return true;
        }
      });
      const list = valid.length > 0 ? valid : bids;
      const best = list.reduce((best, cur) => {
        try {
          return BigInt(cur.makerWager) > BigInt(best.makerWager) ? cur : best;
        } catch {
          return best;
        }
      }, list[0]);

      const taker = BigInt(String(lastTakerWagerWei || '0'));
      const maker = BigInt(String(best?.makerWager || '0'));
      const denom = maker + taker;
      const prob = denom > 0n ? Number(taker) / Number(denom) : 0.5;
      const clamped = Math.max(0, Math.min(0.99, prob));
      setRequestedPrediction(clamped);
      if (typeof onPrediction === 'function') onPrediction(clamped);
    } catch {
      setRequestedPrediction(0.5);
      if (typeof onPrediction === 'function') onPrediction(0.5);
    } finally {
      setIsRequesting(false);
    }
  }, [bids, isRequesting, lastTakerWagerWei, onPrediction]);

  // Fallback: if no bids arrive within a reasonable time window, stop requesting
  React.useEffect(() => {
    if (!isRequesting) return;
    const timeoutMs = 15000;
    const timeout = window.setTimeout(() => {
      if (requestedPrediction == null && (!bids || bids.length === 0)) {
        setIsRequesting(false);
        setQueuedRequest(false);
      }
    }, timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [isRequesting, bids, requestedPrediction]);

  const effectiveOutcomes = React.useMemo<PredictedOutcomeInputStub[]>(() => {
    if (outcomes && outcomes.length > 0) return outcomes;
    if (conditionId) return [{ marketId: conditionId, prediction: true }];
    return [];
  }, [outcomes, conditionId]);

  React.useEffect(() => {
    if (!queuedRequest) return;
    if (!isRequesting) return;
    if (effectiveOutcomes.length === 0 || !selectedTakerAddress) return;
    try {
      const wagerWei = parseUnits('1', 18).toString();
      setLastTakerWagerWei(wagerWei);
      const payload = buildAuctionStartPayload(effectiveOutcomes, chainId);
      const send = () => {
        requestQuotes(
          {
            wager: wagerWei,
            resolver: payload.resolver,
            predictedOutcomes: payload.predictedOutcomes,
            taker: selectedTakerAddress,
            takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
            chainId: chainId,
          },
          { requireSignature: false }
        );
        setQueuedRequest(false);
      };
      // Add a small jitter to reduce simultaneous opens across instances
      const jitter = Math.floor(Math.random() * 301);
      window.setTimeout(send, jitter);
    } catch {
      setIsRequesting(false);
      setQueuedRequest(false);
    }
  }, [
    queuedRequest,
    isRequesting,
    effectiveOutcomes,
    selectedTakerAddress,
    takerNonce,
    requestQuotes,
    chainId,
  ]);

  const handleRequestPrediction = React.useCallback(() => {
    if (prefetchedProbability != null) return;
    if (isRequesting) return;
    setRequestedPrediction(null);
    setIsRequesting(true);
    try {
      // If outcomes aren't ready or no taker address yet -> queue
      if (effectiveOutcomes.length === 0 || !selectedTakerAddress) {
        setQueuedRequest(true);
      } else {
        const wagerWei = parseUnits('1', 18).toString();
        setLastTakerWagerWei(wagerWei);
        const payload = buildAuctionStartPayload(effectiveOutcomes, chainId);
        const send = () => {
          requestQuotes(
            {
              wager: wagerWei,
              resolver: payload.resolver,
              predictedOutcomes: payload.predictedOutcomes,
              taker: selectedTakerAddress,
              takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
              chainId: chainId,
            },
            { requireSignature: false }
          );
        };
        // Jitter send to avoid concurrency clobbering
        const jitter = eager ? eagerJitterMsRef.current : 0;
        if (jitter > 0) {
          window.setTimeout(send, jitter);
        } else {
          send();
        }
      }
    } catch {
      setIsRequesting(false);
    }
  }, [
    effectiveOutcomes,
    selectedTakerAddress,
    takerNonce,
    requestQuotes,
    isRequesting,
    eager,
    chainId,
  ]);

  // Only fire eager once both taker address and outcomes are ready
  React.useEffect(() => {
    if (!eager) return;
    if (prefetchedProbability != null) return;
    if (eagerlyRequestedRef.current) return;
    if (!isInViewport) return;
    if (!selectedTakerAddress) return;
    if (effectiveOutcomes.length === 0) return;
    eagerlyRequestedRef.current = true;
    handleRequestPrediction();
  }, [
    eager,
    isInViewport,
    selectedTakerAddress,
    effectiveOutcomes.length,
    handleRequestPrediction,
  ]);

  return (
    <div
      ref={rootRef}
      className={
        inline
          ? `inline-flex items-center relative ${className || ''}`
          : className
      }
    >
      <AnimatePresence initial={false} mode="wait">
        {requestedPrediction == null ? (
          suppressLoadingPlaceholder ? null : isRequesting ? (
            <motion.span
              key="requesting"
              className="text-muted-foreground"
              style={{
                animation: 'subtle-pulse 3s ease-in-out infinite',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <style>{`@keyframes subtle-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.45; } }`}</style>
              Requesting...
            </motion.span>
          ) : (
            <motion.button
              key="request"
              type="button"
              onClick={handleRequestPrediction}
              className="text-foreground underline decoration-1 decoration-foreground/60 underline-offset-4 transition-colors hover:decoration-foreground/80 cursor-pointer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              Request
            </motion.button>
          )
        ) : (
          <motion.span
            key={`prediction-${requestedPrediction}`}
            className="inline-flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <PercentChance
                probability={requestedPrediction}
                showLabel={true}
                label="chance"
                className="font-mono text-ethena"
              />
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MarketPredictionRequest;
