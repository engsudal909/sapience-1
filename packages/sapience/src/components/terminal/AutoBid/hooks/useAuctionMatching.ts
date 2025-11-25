import { useCallback, useEffect, useRef } from 'react';
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
import {
  buildMintPredictionRequestData,
  type QuoteBid,
} from '~/lib/auction/useAuctionStart';

export type UseAuctionMatchingParams = {
  orders: Order[];
  getOrderIndex: (order: Order) => number;
  pushLogEntry: (entry: PushLogEntryParams) => void;
  allowanceValue: number;
  isPermitLoading: boolean;
  isRestricted: boolean;
  address?: `0x${string}`;
  collateralSymbol: string;
  tokenDecimals: number;
  auctionMessages: AuctionFeedMessage[];
  formatCollateralAmount: (value?: string | null) => string | null;
};

export function useAuctionMatching({
  orders,
  getOrderIndex,
  pushLogEntry,
  allowanceValue,
  isPermitLoading,
  isRestricted,
  address,
  collateralSymbol,
  auctionMessages,
  formatCollateralAmount,
}: UseAuctionMatchingParams) {
  const processedMessageIdsRef = useRef<Set<number>>(new Set());
  const processedMessageQueueRef = useRef<number[]>([]);

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
      const insufficient =
        requiredSpend != null
          ? allowanceValue < requiredSpend
          : allowanceValue <= 0;

      if (insufficient) {
        const statusMessage = 'Insufficient approved spend';
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
          dedupeKey: `allowance:${dedupeBase}`,
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

      pushLogEntry({
        kind: 'system',
        message: `${orderTag} ready for auto-bid`,
        meta: {
          orderId: details.order.id,
          labelSnapshot: orderLabelSnapshot,
        },
        dedupeKey: `ready:${dedupeBase}`,
      });
      return { blocked: false as const, reason: null };
    },
    [allowanceValue, getOrderIndex, isPermitLoading, isRestricted, pushLogEntry]
  );

  const triggerAutoBidSubmission = useCallback(
    (details: {
      order: Order;
      source: 'copy_trade' | 'conditions';
      auctionId?: string | null;
      payload?: Record<string, unknown>;
    }) => {
      const tag = formatOrderTag(details.order, null, getOrderIndex);
      const orderLabelSnapshot = formatOrderLabelSnapshot(tag, details.order);
      const makerCollateral = details.payload?.makerCollateral as
        | string
        | undefined;
      const submittedAmount = formatCollateralAmount(makerCollateral);
      const submittedStatus = submittedAmount
        ? `Submitted ${submittedAmount} ${collateralSymbol}`
        : 'Submitted';
      const submittedLabel = `${tag} bid ${submittedStatus}`;
      pushLogEntry({
        kind: 'system',
        message: submittedLabel,
        severity: 'success',
        meta: {
          orderId: details.order.id,
          labelSnapshot: orderLabelSnapshot,
          source: details.source,
          auctionId: details.auctionId ?? null,
          highlight: submittedStatus,
        },
      });
      try {
        const selectedBid = details.payload?.selectedBid as
          | QuoteBid
          | undefined;
        if (selectedBid) {
          const predictedOutcomes = (details.payload?.predictedOutcomes ||
            []) as `0x${string}`[];
          const resolver = details.payload?.resolver as
            | `0x${string}`
            | undefined;
          const mintDraft = buildMintPredictionRequestData({
            maker:
              (address as `0x${string}`) ||
              ('0x0000000000000000000000000000000000000000' as const),
            selectedBid,
            predictedOutcomes,
            resolver,
            makerCollateral,
          });
          if (!mintDraft) {
            pushLogEntry({
              kind: 'system',
              message: `${tag} auto-bid payload incomplete`,
              meta: {
                orderId: details.order.id,
                labelSnapshot: orderLabelSnapshot,
              },
              dedupeKey: `mint-draft:${details.order.id}:${
                details.auctionId ?? 'na'
              }`,
            });
          }
        } else {
          pushLogEntry({
            kind: 'system',
            message: `${tag} awaiting bid payload`,
            meta: {
              orderId: details.order.id,
              labelSnapshot: orderLabelSnapshot,
            },
            dedupeKey: `await-bid:${details.order.id}:${
              details.auctionId ?? 'na'
            }`,
          });
        }
      } catch (error) {
        pushLogEntry({
          kind: 'system',
          message: `${tag} auto-bid submission stub failed: ${
            (error as Error)?.message || 'unknown error'
          }.`,
          meta: {
            orderId: details.order.id,
            labelSnapshot: orderLabelSnapshot,
          },
          dedupeKey: `auto-bid-error:${details.order.id}`,
        });
      }
    },
    [
      address,
      collateralSymbol,
      formatCollateralAmount,
      getOrderIndex,
      pushLogEntry,
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
        const signature =
          typeof bid?.makerSignature === 'string' ? bid.makerSignature : null;
        const tag = formatOrderTag(matched.order, null, getOrderIndex);
        const increment =
          typeof matched.order.increment === 'number' &&
          Number.isFinite(matched.order.increment)
            ? matched.order.increment
            : null;
        const readiness = evaluateAutoBidReadiness({
          order: matched.order,
          context: {
            kind: 'copy_trade',
            summary: tag,
            auctionId,
            estimatedSpend: increment,
            dedupeSuffix: signature ?? maker,
          },
        });
        if (!readiness.blocked) {
          const quoteBid: QuoteBid = {
            auctionId: auctionId ?? '',
            maker:
              (typeof bid?.maker === 'string' && (bid.maker as string)) ||
              '0x0000000000000000000000000000000000000000',
            makerWager: String(bid?.makerWager ?? '0'),
            makerDeadline: Number(bid?.makerDeadline ?? 0),
            makerSignature:
              (typeof bid?.makerSignature === 'string' &&
                (bid.makerSignature as string)) ||
              '0x',
            makerNonce: Number(bid?.makerNonce ?? 0),
          };
          const predictedOutcomesPayload = resolveMessageField(
            entry?.data,
            'predictedOutcomes'
          );
          triggerAutoBidSubmission({
            order: matched.order,
            source: 'copy_trade',
            auctionId,
            payload: {
              selectedBid: quoteBid,
              predictedOutcomes: Array.isArray(predictedOutcomesPayload)
                ? (predictedOutcomesPayload as `0x${string}`[])
                : [],
              resolver:
                (entry?.data as any)?.resolver ??
                (entry?.data as any)?.payload?.resolver,
              makerCollateral:
                typeof bid?.makerWager === 'string'
                  ? (bid.makerWager as string)
                  : String(bid?.makerWager ?? '0'),
            },
          });
        }
      });
    },
    [evaluateAutoBidReadiness, getOrderIndex, orders, triggerAutoBidSubmission]
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
        const auctionId = entry.channel || null;
        const tag = formatOrderTag(order, null, getOrderIndex);
        const readiness = evaluateAutoBidReadiness({
          order,
          context: {
            kind: 'conditions',
            summary: tag,
            auctionId,
            estimatedSpend: null,
            dedupeSuffix: matchInfo.inverted ? 'inv' : 'dir',
          },
        });
        if (!readiness.blocked) {
          triggerAutoBidSubmission({
            order,
            source: 'conditions',
            auctionId,
            payload: {
              predictedOutcomes: Array.isArray(rawPredictions)
                ? (rawPredictions as `0x${string}`[])
                : [],
              resolver:
                (entry?.data as any)?.resolver ??
                (entry?.data as any)?.payload?.resolver,
            },
          });
        }
      });
    },
    [evaluateAutoBidReadiness, getOrderIndex, orders, triggerAutoBidSubmission]
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

