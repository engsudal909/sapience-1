'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import * as Sentry from '@sentry/nextjs';

export type AuctionBid = {
  auctionId: string;
  taker: string;
  takerWager: string;
  takerDeadline: number;
  takerSignature: string;
  receivedAtMs: number;
};

type Listener = () => void;

class AuctionBidsHub {
  private client: ReturnType<typeof getSharedAuctionWsClient> | null = null;
  private wsUrl: string | null = null;
  private isOpen = false;
  private listeners = new Set<Listener>();
  private pendingSubs = new Set<string>();
  private activeSubs = new Set<string>();
  private receivedAtRef = new Map<string, number>();
  public bidsByAuctionId = new Map<string, AuctionBid[]>();
  private cleanupTimer: number | null = null;

  setUrl(url: string | null | undefined) {
    const next = url || null;
    if (this.wsUrl === next) return;
    this.wsUrl = next;
    this.attachClient();
  }

  private attachClient() {
    if (!this.wsUrl) return;
    const c = getSharedAuctionWsClient(this.wsUrl);
    this.client = c;
    const offOpen = c.addOpenListener(() => {
      this.isOpen = true;
      for (const id of this.pendingSubs) this.sendSubscribe(id);
      Sentry.addBreadcrumb({
        category: 'ws.app',
        level: 'info',
        message: 'resubscribe.bids',
        data: { count: this.pendingSubs.size },
      });
    });
    const offClose = c.addCloseListener(() => {
      this.isOpen = false;
    });
    const offMsg = c.addMessageListener((raw) => this.onMessage(raw as any));
    // Store noop cleanup to avoid GC until URL changes
    if (this.cleanupTimer != null) window.clearInterval(this.cleanupTimer);
    this.cleanupTimer = window.setInterval(() => this.prune(), 60_000);
    // Keep references in instance for potential future detach if needed
    void offOpen;
    void offClose;
    void offMsg;
  }

  private onMessage(msg: any) {
    if (msg?.type !== 'auction.bids') return;
    const raw = Array.isArray(msg?.payload?.bids)
      ? (msg.payload.bids as any[])
      : [];
    if (raw.length === 0) return;
    const updates = new Map<string, AuctionBid[]>();
    for (const b of raw) {
      try {
        const auctionId = String(b?.auctionId || '');
        if (!auctionId) continue;
        const signature = String(b?.takerSignature || '0x');
        const existingTs = this.receivedAtRef.get(signature);
        const receivedAtMs = existingTs ?? Date.now();
        if (existingTs === undefined)
          this.receivedAtRef.set(signature, receivedAtMs);
        const obj: AuctionBid = {
          auctionId,
          taker: String(b?.taker || ''),
          takerWager: String(b?.takerWager || '0'),
          takerDeadline: Number(b?.takerDeadline || 0),
          takerSignature: signature,
          receivedAtMs,
        };
        if (!updates.has(auctionId)) updates.set(auctionId, []);
        updates.get(auctionId)!.push(obj);
      } catch {
        /* noop */
      }
    }
    if (updates.size > 0) {
      for (const [id, arr] of updates.entries()) {
        const capped = [...arr]
          .sort((a, b) => b.receivedAtMs - a.receivedAtMs)
          .slice(0, 200);
        this.bidsByAuctionId.set(id, capped);
      }
      this.emit();
    }
    this.prune();
  }

  private sendSubscribe(auctionId: string) {
    this.pendingSubs.add(auctionId);
    if (!this.client) return;
    this.client.send({ type: 'auction.subscribe', payload: { auctionId } });
    this.activeSubs.add(auctionId);
  }

  private sendUnsubscribe(auctionId: string) {
    this.pendingSubs.delete(auctionId);
    this.activeSubs.delete(auctionId);
    if (!this.client) return;
    this.client.send({ type: 'auction.unsubscribe', payload: { auctionId } });
  }

  ensureSubscribed(auctionId: string | null | undefined) {
    if (!auctionId) return;
    if (this.activeSubs.has(auctionId)) return;
    if (this.isOpen) this.sendSubscribe(auctionId);
    else this.pendingSubs.add(auctionId);
  }

  ensureUnsubscribed(auctionId: string | null | undefined) {
    if (!auctionId) return;
    if (!this.activeSubs.has(auctionId) && !this.pendingSubs.has(auctionId))
      return;
    this.sendUnsubscribe(auctionId);
  }

  addListener(cb: Listener) {
    this.listeners.add(cb);
    // Return a cleanup function that returns void (not boolean)
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit() {
    for (const cb of Array.from(this.listeners)) {
      try {
        cb();
      } catch {
        /* noop */
      }
    }
  }

  private prune() {
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    for (const [id, arr] of Array.from(this.bidsByAuctionId.entries())) {
      const latest = arr && arr.length > 0 ? arr[0] : null;
      const lastAt = Number(latest?.receivedAtMs || 0);
      if (Number.isFinite(lastAt) && lastAt > 0 && lastAt < thirtyMinAgo) {
        this.bidsByAuctionId.delete(id);
      }
    }
  }
}

const hub = new AuctionBidsHub();

export function useAuctionBidsFor(auctionId: string | null | undefined) {
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const [tick, setTick] = useState(0);
  const idRef = useRef<string | null | undefined>(auctionId);

  useEffect(() => {
    hub.setUrl(wsUrl);
  }, [wsUrl]);

  useEffect(() => {
    idRef.current = auctionId;
    hub.ensureSubscribed(auctionId);
    return () => hub.ensureUnsubscribed(auctionId);
  }, [auctionId]);

  useEffect(() => {
    const off = hub.addListener(() => setTick((t) => (t + 1) % 1_000_000));
    return () => {
      off();
    };
  }, []);

  const bids = useMemo(() => {
    if (!auctionId) return [] as AuctionBid[];
    return hub.bidsByAuctionId.get(auctionId) || [];
  }, [auctionId, wsUrl, idRef.current, tick]);

  return { bids };
}

export default hub;
