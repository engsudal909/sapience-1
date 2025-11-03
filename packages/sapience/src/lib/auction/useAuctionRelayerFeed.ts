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

export function useAuctionRelayerFeed(options?: {
  observeVaultQuotes?: boolean;
}) {
  const observeVaultQuotes = !!options?.observeVaultQuotes;
  const { apiBaseUrl } = useSettings();
  // Settings apiBaseUrl default already includes "/auction" path
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const [messages, setMessages] = useState<AuctionFeedMessage[]>([]);
  const subscribedAuctionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);
    // Observe vault quotes (queued until open)
    if (observeVaultQuotes) client.send({ type: 'vault_quote.observe' });

    const offOpen = client.addOpenListener(() => {
      // Resubscribe to all auctions on reconnect
      for (const id of Array.from(subscribedAuctionsRef.current)) {
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
            subscribedAuctionsRef.current.add(subscribeAuctionId);
            client.send({
              type: 'auction.subscribe',
              payload: { auctionId: subscribeAuctionId },
            });
          }
        }
      } catch (_err) {
        // swallow
      }
    });

    return () => {
      if (observeVaultQuotes) client.send({ type: 'vault_quote.unobserve' });
      offMsg();
      offOpen();
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
