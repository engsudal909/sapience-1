'use client';

import * as React from 'react';
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
import { DEFAULT_WAGER_AMOUNT } from '~/lib/utils/betslipUtils';

export interface MarketPredictionRequestProps {
  conditionId?: string;
  outcomes?: PredictedOutcomeInputStub[];
  onPrediction?: (probability: number) => void;
  className?: string;
  inline?: boolean;
  eager?: boolean;
}

const MarketPredictionRequest: React.FC<MarketPredictionRequestProps> = ({
  conditionId,
  outcomes,
  onPrediction,
  className,
  inline = true,
  eager = true,
}) => {
  const [requestedPrediction, setRequestedPrediction] = React.useState<
    number | null
  >(null);
  const [isRequesting, setIsRequesting] = React.useState<boolean>(false);
  const [lastMakerWagerWei, setLastMakerWagerWei] = React.useState<
    string | null
  >(null);
  const [queuedRequest, setQueuedRequest] = React.useState<boolean>(false);

  const { address: makerAddress } = useAccount();
  const { requestQuotes, bids } = useAuctionStart();
  const PREDICTION_MARKET_ADDRESS = predictionMarket[DEFAULT_CHAIN_ID]?.address;

  const eagerlyRequestedRef = React.useRef<boolean>(false);
  const eagerJitterMsRef = React.useRef<number>(
    Math.floor(Math.random() * 301)
  );

  // Track viewport visibility to trigger eager load only when visible
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [isInViewport, setIsInViewport] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!eager) return;
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
  }, [eager]);

  // Generate or retrieve a stable guest maker address for logged-out users
  const guestMakerAddress = React.useMemo<`0x${string}` | null>(() => {
    if (typeof window === 'undefined') return null;
    // Try to read a persisted guest address, but don't fail hard if storage isn't available
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem('sapience_guest_maker_address');
    } catch {
      /* storage unavailable */
    }
    if (stored) return stored as `0x${string}`;

    // Generate an ephemeral address for this session
    let addr: `0x${string}` | null = null;
    try {
      const bytes = new Uint8Array(20);
      (window.crypto || ({} as Crypto)).getRandomValues?.(bytes);
      if (bytes[0] === undefined) throw new Error('no-crypto');
      addr = ('0x' +
        Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')) as `0x${string}`;
    } catch {
      // Fallback to Math.random-based generation (less strong, but fine for a UI nonce)
      const rand = Array.from({ length: 20 }, () =>
        Math.floor(Math.random() * 256)
      );
      addr = ('0x' +
        rand
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')) as `0x${string}`;
    }

    // Best-effort persist for future visits
    try {
      window.localStorage.setItem('sapience_guest_maker_address', addr);
    } catch {
      /* storage unavailable */
    }
    return addr;
  }, []);

  // Prefer connected wallet address; fall back to guest address
  const selectedMakerAddress = makerAddress ?? guestMakerAddress ?? undefined;

  const { data: makerNonce } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: selectedMakerAddress ? [selectedMakerAddress] : undefined,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!selectedMakerAddress && !!PREDICTION_MARKET_ADDRESS },
  });

  const formatPriceAsPercentage = React.useCallback((price: number) => {
    if (!Number.isFinite(price)) return 'Price N/A';
    const percentage = Math.max(0, Math.min(100, price * 100));
    if (percentage < 1) return '<1% chance';
    return `${Math.round(percentage)}% chance`;
  }, []);

  React.useEffect(() => {
    if (!isRequesting) return;
    if (!bids || bids.length === 0) return;
    try {
      const nowMs = Date.now();
      const valid = bids.filter((b) => {
        try {
          const dl = Number(b?.takerDeadline || 0);
          return Number.isFinite(dl) ? dl * 1000 > nowMs : true;
        } catch {
          return true;
        }
      });
      const list = valid.length > 0 ? valid : bids;
      const best = list.reduce((best, cur) => {
        try {
          return BigInt(cur.takerWager) > BigInt(best.takerWager) ? cur : best;
        } catch {
          return best;
        }
      }, list[0]);
      const maker = BigInt(String(lastMakerWagerWei || '0'));
      const taker = BigInt(String(best?.takerWager || '0'));
      const denom = maker + taker;
      const prob = denom > 0n ? Number(maker) / Number(denom) : 0.5;
      const clamped = Math.max(0, Math.min(0.99, prob));
      setRequestedPrediction(clamped);
      if (typeof onPrediction === 'function') onPrediction(clamped);
    } catch {
      setRequestedPrediction(0.5);
      if (typeof onPrediction === 'function') onPrediction(0.5);
    } finally {
      setIsRequesting(false);
    }
  }, [bids, isRequesting, lastMakerWagerWei, onPrediction]);

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
    if (effectiveOutcomes.length === 0 || !selectedMakerAddress) return;
    try {
      const wagerWei = parseUnits(DEFAULT_WAGER_AMOUNT, 18).toString();
      setLastMakerWagerWei(wagerWei);
      const payload = buildAuctionStartPayload(effectiveOutcomes);
      const send = () => {
        requestQuotes({
          wager: wagerWei,
          resolver: payload.resolver,
          predictedOutcomes: payload.predictedOutcomes,
          maker: selectedMakerAddress,
          makerNonce: makerNonce !== undefined ? Number(makerNonce) : 0,
        });
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
    selectedMakerAddress,
    makerNonce,
    requestQuotes,
  ]);

  const handleRequestPrediction = React.useCallback(() => {
    if (isRequesting) return;
    setRequestedPrediction(null);
    setIsRequesting(true);
    try {
      // If outcomes aren't ready or no maker address yet -> queue
      if (effectiveOutcomes.length === 0 || !selectedMakerAddress) {
        setQueuedRequest(true);
      } else {
        const wagerWei = parseUnits(DEFAULT_WAGER_AMOUNT, 18).toString();
        setLastMakerWagerWei(wagerWei);
        const payload = buildAuctionStartPayload(effectiveOutcomes);
        const send = () => {
          requestQuotes({
            wager: wagerWei,
            resolver: payload.resolver,
            predictedOutcomes: payload.predictedOutcomes,
            maker: selectedMakerAddress,
            makerNonce: makerNonce !== undefined ? Number(makerNonce) : 0,
          });
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
    selectedMakerAddress,
    makerNonce,
    requestQuotes,
    isRequesting,
    eager,
  ]);

  // Only fire eager once both maker address and outcomes are ready
  React.useEffect(() => {
    if (!eager) return;
    if (eagerlyRequestedRef.current) return;
    if (!isInViewport) return;
    if (!selectedMakerAddress) return;
    if (effectiveOutcomes.length === 0) return;
    eagerlyRequestedRef.current = true;
    handleRequestPrediction();
  }, [
    eager,
    isInViewport,
    selectedMakerAddress,
    effectiveOutcomes.length,
    handleRequestPrediction,
  ]);

  return (
    <div
      ref={rootRef}
      className={
        inline ? `inline-flex items-center ${className || ''}` : className
      }
    >
      {requestedPrediction == null ? (
        isRequesting ? (
          <span className="text-foreground/70">Requesting...</span>
        ) : (
          <button
            type="button"
            onClick={handleRequestPrediction}
            className="text-foreground underline decoration-1 decoration-foreground/60 underline-offset-4 transition-colors hover:decoration-foreground/80 cursor-pointer"
          >
            Request
          </button>
        )
      ) : (
        <span className="text-foreground font-medium">
          {formatPriceAsPercentage(requestedPrediction)}
        </span>
      )}
    </div>
  );
};

export default MarketPredictionRequest;
