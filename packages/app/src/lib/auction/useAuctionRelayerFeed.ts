'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import * as Sentry from '@sentry/nextjs';

export type AuctionFeedMessage = {
  time: number; // ms epoch
  type: string;
  channel?: string | null; // auctionId when applicable
  data: unknown;
};

// 30-minute staleness threshold for subscription pruning
const SUBSCRIPTION_TTL_MS = 30 * 60 * 1000;

export function useAuctionRelayerFeed(options?: {
  observeVaultQuotes?: boolean;
}) {
  const observeVaultQuotes = !!options?.observeVaultQuotes;
  const { apiBaseUrl } = useSettings();
  // Settings apiBaseUrl default already includes "/auction" path
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const [messages, setMessages] = useState<AuctionFeedMessage[]>([]);
  // Track subscription time to enable pruning of stale subscriptions
  const subscribedAuctionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);
    // Observe vault quotes (queued until open)
    if (observeVaultQuotes) client.send({ type: 'vault_quote.observe' });

    const offOpen = client.addOpenListener(() => {
      // Resubscribe to all auctions on reconnect
      for (const id of Array.from(subscribedAuctionsRef.current.keys())) {
        client.send({ type: 'auction.subscribe', payload: { auctionId: id } });
      }
      Sentry.addBreadcrumb({
        category: 'ws.app',
        level: 'info',
        message: 'resubscribe',
        data: { count: subscribedAuctionsRef.current.size },
      });
    });

    const offMsg = client.addMessageListener((raw) => {
      try {
        const msg = raw as any;
        const now = Date.now();
        const type = String(msg?.type || 'unknown');
        const channel =
          (typeof msg?.payload?.auctionId === 'string' &&
            (msg.payload.auctionId as string)) ||
          (typeof msg?.channel === 'string' && (msg.channel as string)) ||
          (typeof msg?.auctionId === 'string' && (msg.auctionId as string)) ||
          null;
        const entry: AuctionFeedMessage = {
          time: now,
          type,
          channel,
          data: msg?.payload ?? msg,
        };
        setMessages((prev) => {
          const nowMs = Date.now();
          const fiveMinutesAgo = nowMs - 5 * 60 * 1000;
          const next = [entry, ...prev].filter((m) => m.time >= fiveMinutesAgo);
          // Keep a bounded buffer
          return next.slice(0, 1000);
        });

        // Auto-subscribe to auction channel when an auction starts
        if (type === 'auction.started') {
          const subscribeAuctionId =
            (msg?.payload?.auctionId as string) ||
            (msg?.auctionId as string) ||
            null;
          if (subscribeAuctionId) {
            subscribedAuctionsRef.current.set(subscribeAuctionId, now);
            client.send({
              type: 'auction.subscribe',
              payload: { auctionId: subscribeAuctionId },
            });
          }
        }

        // Update last activity for existing subscriptions on bid activity
        if (type === 'auction.bids' && channel) {
          if (subscribedAuctionsRef.current.has(channel)) {
            subscribedAuctionsRef.current.set(channel, now);
          }
        }
      } catch (_err) {
        // swallow
      }
    });

    // Prune stale subscriptions every 60 seconds
    const pruneTimer = setInterval(() => {
      const cutoff = Date.now() - SUBSCRIPTION_TTL_MS;
      for (const [id, subscribedAt] of Array.from(
        subscribedAuctionsRef.current.entries()
      )) {
        if (subscribedAt < cutoff) {
          subscribedAuctionsRef.current.delete(id);
          client.send({
            type: 'auction.unsubscribe',
            payload: { auctionId: id },
          });
        }
      }
    }, 60_000);

    return () => {
      if (observeVaultQuotes) client.send({ type: 'vault_quote.unobserve' });
      offMsg();
      offOpen();
      clearInterval(pruneTimer);
    };
  }, [wsUrl, observeVaultQuotes]);

  // Handle dynamic toggling of observer after connection is established
  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);
    client.send({
      type: observeVaultQuotes
        ? 'vault_quote.observe'
        : 'vault_quote.unobserve',
    });
  }, [observeVaultQuotes]);

  return { messages };
}
