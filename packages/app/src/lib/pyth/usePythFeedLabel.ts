import { useEffect, useState } from 'react';

type HermesPriceFeed = { id: string; symbol?: string; description?: string };

let cachedMap: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

function normalizeHexId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const hex = s.startsWith('0x') ? s : `0x${s}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex.toLowerCase();
}

function tryExtractFeeds(json: unknown): HermesPriceFeed[] {
  const root = json as any;
  const candidates: unknown[] = Array.isArray(root)
    ? root
    : Array.isArray(root?.price_feeds)
      ? root.price_feeds
      : Array.isArray(root?.priceFeeds)
        ? root.priceFeeds
        : Array.isArray(root?.data)
          ? root.data
          : [];

  const out: HermesPriceFeed[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const o = item as any;
    const id = o.id ?? o.price_feed_id ?? o.priceFeedId ?? o.feedId;
    const sym =
      o.symbol ??
      o?.attributes?.symbol ??
      o?.meta?.symbol ??
      o?.product?.symbol ??
      o?.price_feed?.symbol;
    const desc =
      o.description ??
      o?.attributes?.description ??
      o?.meta?.description ??
      o?.product?.description;
    if (typeof id === 'string')
      out.push({ id, symbol: sym, description: desc });
  }
  return out;
}

async function loadHermesFeedMap(): Promise<Map<string, string>> {
  if (cachedMap) return cachedMap;
  if (inflight) return inflight;

  const urls = [
    'https://hermes.pyth.network/api/price_feeds',
    'https://hermes.pyth.network/v2/price_feeds',
  ];

  inflight = (async () => {
    let lastErr: unknown = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok)
          throw new Error(`Hermes price_feeds failed: ${res.status}`);
        const json = (await res.json()) as unknown;
        const feeds = tryExtractFeeds(json);
        if (feeds.length === 0) continue;
        const map = new Map<string, string>();
        for (const f of feeds) {
          const id = normalizeHexId(f.id);
          if (!id) continue;
          const label =
            typeof f.symbol === 'string' && f.symbol.trim().length > 0
              ? f.symbol.trim()
              : typeof f.description === 'string' &&
                  f.description.trim().length > 0
                ? f.description.trim()
                : null;
          if (label) map.set(id, label);
        }
        cachedMap = map;
        return map;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Hermes price_feeds failed');
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function getPythFeedLabelSync(priceId: string): string | null {
  const id = normalizeHexId(priceId);
  if (!id) return null;
  return cachedMap?.get(id) ?? null;
}

export function usePythFeedLabel(
  priceId: string | null | undefined
): string | null {
  const [label, setLabel] = useState<string | null>(() => {
    if (!priceId) return null;
    return getPythFeedLabelSync(priceId);
  });

  useEffect(() => {
    const id = priceId ? normalizeHexId(priceId) : null;
    if (!id) {
      setLabel(null);
      return;
    }
    const existing = cachedMap?.get(id) ?? null;
    if (existing) {
      setLabel(existing);
      return;
    }
    let cancelled = false;
    loadHermesFeedMap()
      .then((m) => {
        if (cancelled) return;
        setLabel(m.get(id) ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [priceId]);

  return label;
}
