'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { formatUnits } from 'viem';

import type { Position as PositionType } from '@sapience/sdk/types/graphql';
import OgShareDialogBase from '~/components/shared/OgShareDialog';
import { usePositions } from '~/hooks/graphql/usePositions';
import {
  useForecasts,
  type FormattedAttestation,
} from '~/hooks/graphql/useForecasts';
import { useUserParlays, type Parlay } from '~/hooks/graphql/useUserParlays';
import { SCHEMA_UID } from '~/lib/constants/eas';

type Anchor = 'trades' | 'lp' | 'forecasts' | 'parlays';

// Extended position type for immediate share cards with additional data
type ExtendedPosition = PositionType & {
  payout?: string;
  side?: string;
  lowPrice?: string;
  highPrice?: string;
  isImmediate?: boolean;
};

type ShareIntentStored = {
  address: string;
  anchor: Anchor;
  clientTimestamp: number;
  txHash?: string;
  positionId?: string | number;
  og?: { imagePath: string; params?: Record<string, any> };
  tradeData?: {
    question: string;
    wager: string;
    payout?: string;
    symbol: string;
    side: string;
    marketId?: number;
  };
  lpData?: {
    question: string;
    symbol: string;
    lowPrice?: string;
    highPrice?: string;
    collateral?: string;
  };
};

export default function ShareAfterRedirect({ address }: { address: Address }) {
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const clearedRef = useRef(false);

  const lowerAddress = String(address).toLowerCase();

  // Data hooks for fallback resolution
  const { data: positions } = usePositions({ address: lowerAddress });
  const { data: forecasts } = useForecasts({
    attesterAddress: lowerAddress,
    schemaId: SCHEMA_UID,
  });
  const { data: parlays } = useUserParlays({ address: lowerAddress });

  const clearIntent = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      window.sessionStorage.removeItem('sapience:share-intent');
      clearedRef.current = true;
    } catch {
      // ignore
    }
  }, []);

  const readIntent = useCallback((): ShareIntentStored | null => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.sessionStorage.getItem('sapience:share-intent');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ShareIntentStored;
      return parsed || null;
    } catch {
      return null;
    }
  }, []);

  const [currentAnchor, setCurrentAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    const updateAnchor = () => {
      if (typeof window === 'undefined') return;
      const raw = window.location.hash?.replace('#', '').toLowerCase();
      if (
        raw === 'trades' ||
        raw === 'lp' ||
        raw === 'forecasts' ||
        raw === 'parlays'
      ) {
        setCurrentAnchor(raw);
      } else {
        setCurrentAnchor(null);
      }
    };

    // Update immediately
    updateAnchor();

    // Listen for hash changes
    window.addEventListener('hashchange', updateAnchor);

    return () => window.removeEventListener('hashchange', updateAnchor);
  }, []);

  // Build minimal OG url from resolved entities
  const toOgUrl = useCallback(
    (
      anchor: Anchor,
      entity: ExtendedPosition | FormattedAttestation | Parlay
    ): string | null => {
      const qp = new URLSearchParams();
      qp.set('addr', lowerAddress);
      try {
        if (anchor === 'trades' && entity) {
          const pos = entity as ExtendedPosition;
          const q =
            pos?.market?.marketGroup?.question || pos?.market?.question || '';
          if (q) qp.set('q', q);
          const symbol =
            pos?.market?.marketGroup?.collateralSymbol ||
            pos?.market?.marketGroup?.baseTokenName ||
            '';
          if (symbol) qp.set('symbol', symbol);
          const wager = pos?.collateral || pos?.transactions?.[0]?.collateral;
          if (wager) qp.set('wager', String(wager));

          // Add payout if available (from immediate data)
          const payout = pos?.payout;
          if (payout) qp.set('payout', String(payout));

          // Add direction/side for the trade (from immediate data)
          const side = pos?.side || '';
          if (side) {
            // Convert side to dir parameter format expected by OG route
            if (side.toLowerCase() === 'yes' || side.toLowerCase() === 'long') {
              qp.set('dir', 'on yes');
            } else if (
              side.toLowerCase() === 'no' ||
              side.toLowerCase() === 'short'
            ) {
              qp.set('dir', 'on no');
            }
          }

          return `/og/trade?${qp.toString()}`;
        }
        if (anchor === 'lp' && entity) {
          const pos = entity as ExtendedPosition;
          const q =
            pos?.market?.marketGroup?.question || pos?.market?.question || '';
          if (q) qp.set('q', q);
          const symbol =
            pos?.market?.marketGroup?.collateralSymbol ||
            pos?.market?.marketGroup?.baseTokenName ||
            '';
          if (symbol) qp.set('symbol', symbol);

          // Add price range for LP positions (from immediate data)
          const lowPrice = pos?.lowPrice;
          const highPrice = pos?.highPrice;
          if (lowPrice) qp.set('low', String(lowPrice));
          if (highPrice) qp.set('high', String(highPrice));

          return `/og/liquidity?${qp.toString()}`;
        }
        if (anchor === 'forecasts' && entity) {
          const q = '';
          if (q) qp.set('q', q);
          const f = entity as FormattedAttestation;
          if (f?.rawTime) qp.set('created', String(f.rawTime));
          return `/og/forecast?${qp.toString()}`;
        }
        if (anchor === 'parlays' && entity) {
          // Encode all legs with question and prediction choice
          const parlay = entity as Parlay;
          const legs = (parlay?.predictedOutcomes || [])
            .map((o) => {
              const question =
                (o?.condition?.shortName as string) ||
                (o?.condition?.question as string);
              const choice = o?.prediction ? 'Yes' : 'No';
              return question ? `${question}|${choice}` : null;
            })
            .filter(Boolean);
          if (legs.length > 0) {
            legs.forEach((l) => qp.append('leg', String(l)));
          }

          const collateralDecimals = 18;
          const collateralSymbol = 'testUSDe';
          if (parlay?.makerCollateral) {
            const wager = parseFloat(
              formatUnits(BigInt(parlay.makerCollateral), collateralDecimals)
            ).toFixed(2); // not sure if this is too much lol
            qp.set('wager', wager);
          }

          if (parlay?.totalCollateral) {
            const totalCollateralBigInt = BigInt(parlay.totalCollateral);
            const payout = parseFloat(
              formatUnits(totalCollateralBigInt, collateralDecimals)
            ).toFixed(2); //same here
            qp.set('payout', payout);
          }

          qp.set('symbol', collateralSymbol);

          return `/og/parlay?${qp.toString()}`;
        }
      } catch {
        // ignore
      }
      return null;
    },
    [lowerAddress]
  );

  // Main effect: attempt to resolve and show
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (clearedRef.current) return;

    const intent = readIntent();
    if (!intent) return;

    // Validate address and anchor
    const intentAddr = String(intent.address || '').toLowerCase();
    if (!intentAddr || intentAddr !== lowerAddress) return;
    if (!currentAnchor || currentAnchor !== intent.anchor) return;

    // Path 1: immediate OG provided by caller
    if (intent.og && intent.og.imagePath) {
      try {
        const params = new URLSearchParams(
          Object.fromEntries(
            Object.entries(intent.og.params || {})
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)])
          )
        );
        const src = `${intent.og.imagePath}?${params.toString()}`;
        setImageSrc(src);
        setOpen(true);
        clearIntent();
        return;
      } catch {
        // fallthrough to resolution
      }
    }

    // Path 2: attempt to resolve via data hooks, up to 60s
    const start = Date.now();
    const windowMs = 2 * 60 * 1000; // 2 minutes
    const deadline = start + 60 * 1000; // give up after 60s
    const timer = setInterval(() => {
      const now = Date.now();
      if (now > deadline) {
        clearInterval(timer);
        clearIntent();
        return;
      }

      const ts = Number(intent.clientTimestamp || 0);
      const minTs = ts - windowMs;
      const maxTs = ts + windowMs;

      let resolved: ExtendedPosition | FormattedAttestation | Parlay | null =
        null;

      if (intent.anchor === 'trades' && intent.tradeData) {
        resolved = {
          positionId: 'pending-' + Date.now(),
          market: {
            question: intent.tradeData.question,
            marketGroup: {
              collateralSymbol: intent.tradeData.symbol,
            },
          },
          collateral: intent.tradeData.wager,
          payout: intent.tradeData.payout,
          side: intent.tradeData.side,
          marketId: intent.tradeData.marketId,
          isImmediate: true,
        } as unknown as ExtendedPosition;
      }

      // For LP, if we have lpData in the intent, use it immediately
      if (intent.anchor === 'lp' && intent.lpData) {
        resolved = {
          positionId: 'pending-' + Date.now(),
          market: {
            question: intent.lpData.question,
            marketGroup: {
              collateralSymbol: intent.lpData.symbol,
            },
          },
          collateral: intent.lpData.collateral,
          lowPrice: intent.lpData.lowPrice,
          highPrice: intent.lpData.highPrice,
          isLP: true,
          isImmediate: true,
        } as unknown as ExtendedPosition;
      }

      // Fallback to GraphQL data if no immediate data
      if (!resolved && (intent.anchor === 'trades' || intent.anchor === 'lp')) {
        const isLp = intent.anchor === 'lp';
        const list: PositionType[] = (positions || []).filter(
          (p: PositionType) => Boolean(p?.isLP) === isLp
        );

        // Check if we have positions data and log key info

        // Try by positionId
        if (intent.positionId !== undefined) {
          const pid = String(intent.positionId);
          resolved =
            list.find((p: PositionType) => String(p.positionId) === pid) ||
            null;
        }
        // Try by txHash - check ALL positions, not just filtered list
        if (!resolved && intent.txHash) {
          const txh = String(intent.txHash).toLowerCase();

          // First try in the filtered list
          resolved =
            list.find((p: PositionType) =>
              (p?.transactions || []).some(
                (t: any) =>
                  String(t?.event?.transactionHash || '').toLowerCase() === txh
              )
            ) || null;

          // If not found, try ALL positions (maybe isLP flag is wrong)
          if (!resolved) {
            resolved =
              (positions || []).find((p: PositionType) =>
                (p?.transactions || []).some(
                  (t: any) =>
                    String(t?.event?.transactionHash || '').toLowerCase() ===
                    txh
                )
              ) || null;
          }
        }
        // Fallback by recency window
        if (!resolved) {
          const within = list
            .map((p: PositionType) => {
              const created = Number(p?.createdAt ?? 0);
              const latestTx = Math.max(
                0,
                ...(p?.transactions || []).map((t: any) =>
                  Number(t?.createdAt ?? 0)
                )
              );
              const candidateTs =
                Number.isFinite(latestTx) && latestTx > 0 ? latestTx : created;
              return { p, candidateTs };
            })
            .filter(
              (x: { p: PositionType; candidateTs: number }) =>
                Number.isFinite(x.candidateTs) &&
                x.candidateTs >= minTs / 1000 - 5 &&
                x.candidateTs <= maxTs / 1000 + 5
            );
          within.sort(
            (
              a: { p: PositionType; candidateTs: number },
              b: { p: PositionType; candidateTs: number }
            ) => b.candidateTs - a.candidateTs
          );
          resolved = within[0]?.p || null;

          // Only log when we actually find something or fail definitively
        }
      } else if (intent.anchor === 'forecasts') {
        const list: FormattedAttestation[] = forecasts || [];
        resolved =
          list.find(
            (f: FormattedAttestation) => Number(f.rawTime) * 1000 >= minTs
          ) || null;
      } else if (intent.anchor === 'parlays') {
        const list: Parlay[] = parlays || [];
        const filtered = list.filter(
          (p: Parlay) => Number(p.mintedAt) * 1000 >= minTs
        );
        resolved =
          filtered.sort(
            (a: Parlay, b: Parlay) => Number(b.mintedAt) - Number(a.mintedAt)
          )[0] || null;
      }

      if (resolved) {
        const src = toOgUrl(intent.anchor, resolved);
        if (src) {
          clearInterval(timer);
          setImageSrc(src);
          setOpen(true);
          clearIntent();
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    lowerAddress,
    currentAnchor,
    positions,
    forecasts,
    parlays,
    readIntent,
    toOgUrl,
    clearIntent,
  ]);

  if (!imageSrc) return null;

  return (
    <OgShareDialogBase
      imageSrc={imageSrc}
      open={open}
      onOpenChange={setOpen}
      title="Share"
      shareTitle="Share"
    />
  );
}
