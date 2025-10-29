'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';

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
  private ws: WebSocket | null = null;
  private wsUrl: string | null = null;
  private isOpen = false;
  private reconnecting = false;
  private listeners = new Set<Listener>();
  private pendingSubs = new Set<string>();
  private activeSubs = new Set<string>();
  private receivedAtRef = new Map<string, number>();
  public bidsByAuctionId = new Map<string, AuctionBid[]>();

  setUrl(url: string | null | undefined) {
    const next = url || null;
    if (this.wsUrl === next) return;
    this.wsUrl = next;
    this.reconnect();
  }

  private reconnect() {
    try {
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* noop */
        }
        this.ws = null;
      }
      if (!this.wsUrl) return;
      this.connect();
    } catch {
      /* noop */
    }
  }

  private connect() {
    if (!this.wsUrl) return;
    try {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      this.isOpen = false;

      ws.onopen = () => {
        this.isOpen = true;
        // flush pending subscriptions
        for (const id of this.pendingSubs) this.sendSubscribe(id);
      };

      ws.onclose = () => {
        this.isOpen = false;
        this.ws = null;
        if (!this.reconnecting) {
          this.reconnecting = true;
          // simple backoff
          setTimeout(() => {
            this.reconnecting = false;
            this.connect();
          }, 800);
        }
      };

      ws.onerror = () => {
        // let onclose handle reconnect
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
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
              this.bidsByAuctionId.set(id, arr);
            }
            this.emit();
          }
        } catch {
          /* noop */
        }
      };
    } catch {
      /* noop */
    }
  }

  private sendSubscribe(auctionId: string) {
    this.pendingSubs.add(auctionId);
    if (!this.ws) return;
    try {
      this.ws.send(
        JSON.stringify({
          type: 'auction.subscribe',
          payload: { auctionId },
        })
      );
      this.activeSubs.add(auctionId);
    } catch {
      /* noop */
    }
  }

  private sendUnsubscribe(auctionId: string) {
    this.pendingSubs.delete(auctionId);
    this.activeSubs.delete(auctionId);
    if (!this.ws) return;
    try {
      this.ws.send(
        JSON.stringify({
          type: 'auction.unsubscribe',
          payload: { auctionId },
        })
      );
    } catch {
      /* noop */
    }
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
