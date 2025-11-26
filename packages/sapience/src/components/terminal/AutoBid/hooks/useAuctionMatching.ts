import { useCallback, useEffect, useRef } from 'react';
import { parseUnits, formatUnits } from 'viem';
import type { Order } from '../types';
import type { PushLogEntryParams } from './useAutoBidLogs';
import {
  decodePredictedOutcomes,
  formatOrderLabelSnapshot,
  formatOrderTag,
  getConditionMatchInfo,
  normalizeAddress,
  resolveMessageField,
} from '../utils';
import type { AuctionFeedMessage } from '~/lib/auction/useAuctionRelayerFeed';
import type {
  BidSubmissionParams,
  BidSubmissionResult,
} from '~/hooks/auction/useBidSubmission';

/** Cached auction context from auction.started messages */
type AuctionContext = {
  predictedOutcomes: `0x${string}`[];
  resolver: `0x${string}`;
  taker: `0x${string}`;
  takerWager: string;
  takerNonce: number;
};

export type UseAuctionMatchingParams = {
  orders: Order[];
  getOrderIndex: (order: Order) => number;
  pushLogEntry: (entry: PushLogEntryParams) => void;
  balanceValue: number;
  allowanceValue: number;
  isPermitLoading: boolean;
  isRestricted: boolean;
  address?: `0x${string}`;
  collateralSymbol: string;
  tokenDecimals: number;
  auctionMessages: AuctionFeedMessage[];
  formatCollateralAmount: (value?: string | null) => string | null;
  submitBid: (params: BidSubmissionParams) => Promise<BidSubmissionResult>;
};

export function useAuctionMatching({
  orders,
  getOrderIndex,
  pushLogEntry,
  balanceValue,
  allowanceValue,
  isPermitLoading,
  isRestricted,
  address: _address,
  collateralSymbol,
  tokenDecimals,
  auctionMessages,
  formatCollateralAmount,
  submitBid,
}: UseAuctionMatchingParams) {
  const processedMessageIdsRef = useRef<Set<number>>(new Set());
  const processedMessageQueueRef = useRef<number[]>([]);
  // Cache auction context from auction.started messages for use by copy_trade on auction.bids
  const auctionContextCacheRef = useRef<Map<string, AuctionContext>>(new Map());
  // Track insertion order for LRU eviction
  const auctionContextKeysRef = useRef<string[]>([]);
  const MAX_AUCTION_CACHE_SIZE = 200;

  // Track processed bids by (orderId + auctionId + bidSignature) to avoid duplicate submissions
  // when the same bid appears in multiple auction.bids messages
  const processedBidsRef = useRef<Set<string>>(new Set());
  const processedBidsQueueRef = useRef<string[]>([]);
  const MAX_PROCESSED_BIDS_SIZE = 500;

  const evaluateAutoBidReadiness = useCallback(
    (details: {
      order: Order;
      context: {
        kind: 'copy_trade' | 'conditions';
        summary: string;
        auctionId?: string | null;
        estimatedSpend?: number | null;
        dedupeSuffix?: string | null;
      };
    }) => {
      const dedupeBase = `${details.order.id}:${
        details.context.kind
      }:${details.context.auctionId ?? 'none'}:${
        details.context.dedupeSuffix ?? 'default'
      }`;

      const orderTag = formatOrderTag(details.order, null, getOrderIndex);
      const orderLabelSnapshot = formatOrderLabelSnapshot(
        orderTag,
        details.order
      );

      if (isPermitLoading) {
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} compliance check pending; holding auto-bid`,
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
          },
          dedupeKey: `permit:${dedupeBase}`,
        });
        return { blocked: true as const, reason: 'permit_loading' as const };
      }

      const requiredSpend =
        typeof details.context.estimatedSpend === 'number' &&
        Number.isFinite(details.context.estimatedSpend)
          ? details.context.estimatedSpend
          : null;

      // Check balance first (prioritize over allowance)
      const insufficientBalance =
        requiredSpend != null
          ? balanceValue < requiredSpend
          : balanceValue <= 0;

      if (insufficientBalance) {
        const statusMessage = 'Insufficient account balance';
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} bid ${statusMessage}`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            requiredSpend,
            balanceValue,
            highlight: statusMessage,
          },
          // Dedupe per order + auction only (not per bid) so it shows once per auction attempt
          dedupeKey: `balance:${details.order.id}:${details.context.auctionId ?? 'none'}`,
        });
        return { blocked: true as const, reason: 'balance' as const };
      }

      // Check allowance after balance
      const insufficientAllowance =
        requiredSpend != null
          ? allowanceValue < requiredSpend
          : allowanceValue <= 0;

      if (insufficientAllowance) {
        const statusMessage = 'Insufficient spend approved';
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} bid ${statusMessage}`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            requiredSpend,
            allowanceValue,
            highlight: statusMessage,
          },
          // Dedupe per order + auction only (not per bid) so it shows once per auction attempt
          dedupeKey: `allowance:${details.order.id}:${details.context.auctionId ?? 'none'}`,
        });
        return { blocked: true as const, reason: 'allowance' as const };
      }

      if (isRestricted) {
        const statusMessage =
          'You cannot access this app from a restricted region';
        pushLogEntry({
          kind: 'system',
          message: `${orderTag} bid ${statusMessage}`,
          severity: 'error',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            highlight: statusMessage,
          },
          dedupeKey: `geofence:${dedupeBase}`,
        });
        return { blocked: true as const, reason: 'geofence' as const };
      }

      // Ready to submit - no log needed here, will log after successful submission
      return { blocked: false as const, reason: null };
    },
    [
      allowanceValue,
      balanceValue,
      getOrderIndex,
      isPermitLoading,
      isRestricted,
      pushLogEntry,
    ]
  );

  const triggerAutoBidSubmission = useCallback(
    async (details: {
      order: Order;
      source: 'copy_trade' | 'conditions';
      /** For conditions: whether the match is inverted (opposite side) */
      inverted?: boolean;
      auctionId?: string | null;
      /** Auction context from the feed message */
      auctionContext?: {
        takerWager: string; // wei string
        taker: `0x${string}`;
        takerNonce: number;
        predictedOutcomes: `0x${string}`[];
        resolver: `0x${string}`;
      };
      /** For copy_trade: the bid we're copying + increment */
      copyBidContext?: {
        copiedBidWager: string; // wei string from the bid we're copying
        increment: number; // human-readable increment from order config
      };
    }) => {
      const tag = formatOrderTag(details.order, null, getOrderIndex);
      const orderLabelSnapshot = formatOrderLabelSnapshot(tag, details.order);

      // Validate required auction context
      if (!details.auctionId || !details.auctionContext) {
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid skipped, missing auction context`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
          },
          dedupeKey: `context:${details.order.id}:${details.auctionId ?? 'na'}`,
        });
        return;
      }

      const { takerWager, taker, takerNonce, predictedOutcomes, resolver } =
        details.auctionContext;

      // Calculate our bid amount (makerWager)
      let makerWagerWei: bigint;
      try {
        if (details.source === 'copy_trade' && details.copyBidContext) {
          // For copy_trade: copied bid + increment
          const copiedWei = BigInt(
            details.copyBidContext.copiedBidWager || '0'
          );
          const incrementWei = parseUnits(
            String(details.copyBidContext.increment || 0),
            tokenDecimals
          );
          makerWagerWei = copiedWei + incrementWei;
        } else {
          // For conditions strategy: calculate wager based on probability threshold
          // Formula: makerWager = (probability * takerWager) / (1 - probability)
          // This gives us the exact odds we want
          const takerWagerBigInt = BigInt(takerWager || '0');
          const rawProbability = (details.order.odds ?? 50) / 100; // odds is stored as percentage (0-100)
          // Invert probability for opposite-side matches (single-leg orders matching the other side)
          const probability = details.inverted
            ? 1 - rawProbability
            : rawProbability;

          if (probability >= 1 || probability <= 0) {
            // Invalid probability, skip
            pushLogEntry({
              kind: 'system',
              message: `${tag} bid skipped, invalid probability threshold`,
              severity: 'warning',
              meta: {
                orderId: details.order.id,
                labelSnapshot: orderLabelSnapshot,
                probability: details.order.odds,
              },
              dedupeKey: `prob:${details.order.id}:${details.auctionId}`,
            });
            return;
          }

          // Calculate using bigint math with precision scaling to avoid floating point errors
          // makerWager = (probability * takerWager) / (1 - probability)
          const PRECISION = 10000n;
          const probabilityScaled = BigInt(Math.round(probability * 10000));
          const numerator = probabilityScaled * takerWagerBigInt;
          const denominator = PRECISION - probabilityScaled;

          if (denominator <= 0n || numerator <= 0n) {
            pushLogEntry({
              kind: 'system',
              message: `${tag} bid skipped, cannot calculate wager amount`,
              severity: 'warning',
              meta: {
                orderId: details.order.id,
                labelSnapshot: orderLabelSnapshot,
              },
              dedupeKey: `calc:${details.order.id}:${details.auctionId}`,
            });
            return;
          }

          makerWagerWei = numerator / denominator;
        }
      } catch {
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid skipped, invalid bid amount`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
          },
          dedupeKey: `amount:${details.order.id}:${details.auctionId}`,
        });
        return;
      }

      if (makerWagerWei <= 0n) {
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid skipped, zero bid amount`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
          },
          dedupeKey: `zero:${details.order.id}:${details.auctionId}`,
        });
        return;
      }

      // Final safety check: verify balance and allowance before signing
      // This is a belt-and-suspenders check in case values changed between
      // the readiness check and now
      const bidAmountHuman = Number(formatUnits(makerWagerWei, tokenDecimals));

      if (balanceValue < bidAmountHuman) {
        const statusMessage = 'Insufficient account balance';
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid ${statusMessage}`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            requiredSpend: bidAmountHuman,
            balanceValue,
            highlight: statusMessage,
          },
          dedupeKey: `balance-final:${details.order.id}:${details.auctionId}`,
        });
        return;
      }

      if (allowanceValue < bidAmountHuman) {
        const statusMessage = 'Insufficient spend approved';
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid ${statusMessage}`,
          severity: 'warning',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
            requiredSpend: bidAmountHuman,
            allowanceValue,
            highlight: statusMessage,
          },
          dedupeKey: `allowance-final:${details.order.id}:${details.auctionId}`,
        });
        return;
      }

      // Default expiry: 60 seconds (reasonable for auto-bids)
      const expirySeconds = 60;

      try {
        // Actually submit the bid using the shared hook
        const result = await submitBid({
          auctionId: details.auctionId,
          makerWager: makerWagerWei,
          takerWager: BigInt(takerWager || '0'),
          predictedOutcomes,
          resolver,
          taker,
          takerNonce,
          expirySeconds,
        });

        const makerAmount = formatCollateralAmount(makerWagerWei.toString());
        const takerWagerBigInt = BigInt(takerWager || '0');
        const totalWei = makerWagerWei + takerWagerBigInt;
        const toWinAmount = formatCollateralAmount(totalWei.toString());

        const submittedStatus =
          makerAmount && toWinAmount
            ? `${makerAmount} ${collateralSymbol} to win ${toWinAmount} ${collateralSymbol}`
            : makerAmount
              ? `${makerAmount} ${collateralSymbol}`
              : 'Submitted';

        if (result.signature) {
          // Bid was signed and sent - log as success regardless of ack status
          pushLogEntry({
            kind: 'system',
            message: `${tag} bid ${submittedStatus}`,
            severity: 'success',
            meta: {
              orderId: details.order.id,
              labelSnapshot: orderLabelSnapshot,
              source: details.source,
              auctionId: details.auctionId,
              highlight: submittedStatus,
              makerWager: makerWagerWei.toString(),
              takerWager,
            },
          });
        } else {
          // Log failed submission (signature was rejected or other error)
          pushLogEntry({
            kind: 'system',
            message: `${tag} bid ${result.error || 'Unknown error'}`,
            severity: 'error',
            meta: {
              orderId: details.order.id,
              labelSnapshot: orderLabelSnapshot,
              source: details.source,
              auctionId: details.auctionId,
              error: result.error,
            },
            dedupeKey: `failed:${details.order.id}:${details.auctionId}`,
          });
        }
      } catch (error) {
        pushLogEntry({
          kind: 'system',
          message: `${tag} bid ${(error as Error)?.message || 'Unknown error'}`,
          severity: 'error',
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
          },
          dedupeKey: `error:${details.order.id}:${details.auctionId ?? 'na'}`,
        });
      }
    },
    [
      allowanceValue,
      balanceValue,
      collateralSymbol,
      formatCollateralAmount,
      getOrderIndex,
      pushLogEntry,
      submitBid,
      tokenDecimals,
    ]
  );

  const handleCopyTradeMatches = useCallback(
    (entry: AuctionFeedMessage) => {
      const rawBids = resolveMessageField(entry?.data, 'bids');
      const bids = Array.isArray(rawBids) ? rawBids : [];
      if (bids.length === 0) {
        return;
      }
      const activeCopyOrders = orders.filter(
        (order) =>
          order.strategy === 'copy_trade' &&
          order.status === 'active' &&
          !!order.copyTradeAddress
      );
      if (activeCopyOrders.length === 0) {
        return;
      }
      const normalizedOrders = activeCopyOrders
        .map((order) => ({
          order,
          address: normalizeAddress(order.copyTradeAddress),
        }))
        .filter((item) => Boolean(item.address)) as Array<{
        order: Order;
        address: string;
      }>;
      if (normalizedOrders.length === 0) {
        return;
      }
      bids.forEach((bid: any) => {
        const makerRaw = typeof bid?.maker === 'string' ? bid.maker : null;
        const maker = normalizeAddress(makerRaw);
        if (!maker) return;
        const matched = normalizedOrders.find((item) => item.address === maker);
        if (!matched) return;
        const auctionId =
          (typeof bid?.auctionId === 'string' && bid.auctionId) ||
          entry.channel ||
          null;

        // Look up cached auction context from auction.started message
        const cachedContext = auctionId
          ? auctionContextCacheRef.current.get(auctionId)
          : null;
        if (!cachedContext) {
          // No cached context - auction.started message may not have been received yet
          // This can happen if the user joins mid-auction or network issues occur
          return;
        }

        const signature =
          typeof bid?.makerSignature === 'string' ? bid.makerSignature : null;

        // Create a unique key for this bid to prevent duplicate submissions
        // when the same bid appears in multiple auction.bids messages
        const bidDedupeKey = `${matched.order.id}:${auctionId}:${signature ?? `${maker}:${bid?.makerWager ?? '0'}`}`;

        // Skip if we've already processed this exact bid for this order
        if (processedBidsRef.current.has(bidDedupeKey)) {
          return;
        }

        const tag = formatOrderTag(matched.order, null, getOrderIndex);
        const increment =
          typeof matched.order.increment === 'number' &&
          Number.isFinite(matched.order.increment)
            ? matched.order.increment
            : 1;

        // Calculate the full bid amount for allowance checking (copiedWager + increment)
        // This ensures we don't prompt for signature if allowance is insufficient
        const copiedWagerWei = BigInt(String(bid?.makerWager ?? '0'));
        let estimatedSpend: number;
        try {
          const incrementWei = parseUnits(String(increment), tokenDecimals);
          const totalWei = copiedWagerWei + incrementWei;
          estimatedSpend = Number(formatUnits(totalWei, tokenDecimals));
        } catch {
          // Fallback to just increment if parsing fails
          estimatedSpend = increment;
        }

        const readiness = evaluateAutoBidReadiness({
          order: matched.order,
          context: {
            kind: 'copy_trade',
            summary: tag,
            auctionId,
            estimatedSpend,
            dedupeSuffix: signature ?? maker,
          },
        });
        if (!readiness.blocked) {
          // Mark this bid as processed BEFORE submission to prevent race conditions
          processedBidsRef.current.add(bidDedupeKey);
          processedBidsQueueRef.current.push(bidDedupeKey);
          // Evict oldest entries if cache exceeds limit
          while (
            processedBidsQueueRef.current.length > MAX_PROCESSED_BIDS_SIZE
          ) {
            const oldest = processedBidsQueueRef.current.shift();
            if (oldest) processedBidsRef.current.delete(oldest);
          }

          // Fire and forget - don't await to avoid blocking the loop
          void triggerAutoBidSubmission({
            order: matched.order,
            source: 'copy_trade',
            auctionId,
            auctionContext: cachedContext,
            copyBidContext: {
              copiedBidWager: String(bid?.makerWager ?? '0'),
              increment: matched.order.increment ?? 1,
            },
          });
        }
      });
    },
    [
      evaluateAutoBidReadiness,
      getOrderIndex,
      orders,
      tokenDecimals,
      triggerAutoBidSubmission,
    ]
  );

  const handleConditionMatches = useCallback(
    (entry: AuctionFeedMessage) => {
      const rawPredictions = resolveMessageField(
        entry?.data,
        'predictedOutcomes'
      );
      const predictedLegs = decodePredictedOutcomes(rawPredictions);
      if (predictedLegs.length === 0) {
        return;
      }

      // Extract auction context from auction.started message
      const auctionId = entry.channel || null;
      const resolverAddr =
        (entry?.data as any)?.resolver ??
        (entry?.data as any)?.payload?.resolver;
      const takerAddr =
        (entry?.data as any)?.taker ?? (entry?.data as any)?.payload?.taker;
      const takerWagerStr =
        (entry?.data as any)?.wager ??
        (entry?.data as any)?.payload?.wager ??
        '0';
      const takerNonceNum =
        (entry?.data as any)?.takerNonce ??
        (entry?.data as any)?.payload?.takerNonce ??
        0;
      const predictedOutcomesArr = Array.isArray(rawPredictions)
        ? (rawPredictions as `0x${string}`[])
        : [];

      // Cache auction context for copy_trade to use when processing auction.bids
      if (
        auctionId &&
        predictedOutcomesArr.length > 0 &&
        resolverAddr &&
        takerAddr
      ) {
        const ctx: AuctionContext = {
          predictedOutcomes: predictedOutcomesArr,
          resolver: resolverAddr as `0x${string}`,
          taker: takerAddr as `0x${string}`,
          takerWager: takerWagerStr,
          takerNonce: Number(takerNonceNum),
        };
        auctionContextCacheRef.current.set(auctionId, ctx);
        auctionContextKeysRef.current.push(auctionId);
        // Evict oldest entries if cache exceeds limit
        while (auctionContextKeysRef.current.length > MAX_AUCTION_CACHE_SIZE) {
          const oldest = auctionContextKeysRef.current.shift();
          if (oldest) auctionContextCacheRef.current.delete(oldest);
        }
      }

      const activeConditionOrders = orders.filter(
        (order) =>
          order.strategy === 'conditions' &&
          order.status === 'active' &&
          (order.conditionSelections?.length ?? 0) > 0
      );
      if (activeConditionOrders.length === 0) {
        return;
      }
      activeConditionOrders.forEach((order) => {
        const matchInfo = getConditionMatchInfo(order, predictedLegs);
        if (!matchInfo) {
          return;
        }
        const tag = formatOrderTag(order, null, getOrderIndex);
        // For conditions strategy, calculate estimated spend based on probability threshold
        // Formula: makerWager = (probability * takerWager) / (1 - probability)
        let estimatedSpend = 1;
        try {
          const probability = (order.odds ?? 50) / 100;
          if (probability > 0 && probability < 1) {
            const takerWagerNum = Number(
              formatUnits(BigInt(takerWagerStr || '0'), tokenDecimals)
            );
            if (Number.isFinite(takerWagerNum) && takerWagerNum > 0) {
              estimatedSpend =
                (probability * takerWagerNum) / (1 - probability);
            }
          }
        } catch {
          // Fallback to default
        }
        const readiness = evaluateAutoBidReadiness({
          order,
          context: {
            kind: 'conditions',
            summary: tag,
            auctionId,
            estimatedSpend,
            dedupeSuffix: matchInfo.inverted ? 'inv' : 'dir',
          },
        });
        if (!readiness.blocked) {
          // Fire and forget - don't await to avoid blocking the loop
          void triggerAutoBidSubmission({
            order,
            source: 'conditions',
            inverted: matchInfo.inverted,
            auctionId,
            auctionContext: {
              takerWager: takerWagerStr,
              taker: takerAddr as `0x${string}`,
              takerNonce: Number(takerNonceNum),
              predictedOutcomes: predictedOutcomesArr,
              resolver: resolverAddr as `0x${string}`,
            },
          });
        }
      });
    },
    [
      evaluateAutoBidReadiness,
      getOrderIndex,
      orders,
      tokenDecimals,
      triggerAutoBidSubmission,
    ]
  );

  const handleAuctionMessage = useCallback(
    (entry: AuctionFeedMessage) => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.type === 'auction.bids') {
        handleCopyTradeMatches(entry);
      } else if (entry.type === 'auction.started') {
        handleConditionMatches(entry);
      }
    },
    [handleConditionMatches, handleCopyTradeMatches]
  );

  // Process auction messages
  useEffect(() => {
    if (!auctionMessages || auctionMessages.length === 0) {
      return;
    }
    for (const entry of auctionMessages) {
      const key = typeof entry?.time === 'number' ? entry.time : null;
      if (key == null) continue;
      if (processedMessageIdsRef.current.has(key)) {
        continue;
      }
      processedMessageIdsRef.current.add(key);
      processedMessageQueueRef.current.push(key);
      if (processedMessageQueueRef.current.length > 1200) {
        const oldest = processedMessageQueueRef.current.shift();
        if (oldest != null) {
          processedMessageIdsRef.current.delete(oldest);
        }
      }
      handleAuctionMessage(entry);
    }
  }, [auctionMessages, handleAuctionMessage]);

  return {
    evaluateAutoBidReadiness,
    triggerAutoBidSubmission,
    handleCopyTradeMatches,
    handleConditionMatches,
    handleAuctionMessage,
  };
}
