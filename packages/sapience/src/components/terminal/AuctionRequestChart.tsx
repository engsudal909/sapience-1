'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import AuctionBidsChart from '~/components/terminal/AuctionBidsChart';
import { formatEther } from 'viem';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { Info } from 'lucide-react';
import type { AuctionBid } from '~/lib/auction/useAuctionBids';

type Props = {
  bids: AuctionBid[];
  refreshMs?: number;
  makerWager: string | null;
  collateralAssetTicker: string;
  maxEndTimeSec?: number;
  maker?: string | null;
  hasMultipleConditions?: boolean;
};

const AuctionRequestChart: React.FC<Props> = ({
  bids,
  refreshMs = 90,
  makerWager,
  collateralAssetTicker,
  maxEndTimeSec: _maxEndTimeSec,
  maker,
  hasMultipleConditions,
}) => {
  // Throttle incoming bids to ~10–12 fps using rAF
  const [displayBids, setDisplayBids] = useState<AuctionBid[]>(bids || []);
  const pendingRef = useRef<AuctionBid[] | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRenderRef = useRef<number>(0);
  const minFrameMs = 90; // ~11 fps

  useEffect(() => {
    pendingRef.current = bids || [];
    const loop = (t: number) => {
      const now = t || performance.now();
      const elapsed = now - (lastRenderRef.current || 0);
      if (elapsed >= minFrameMs) {
        lastRenderRef.current = now;
        if (pendingRef.current) setDisplayBids(pendingRef.current);
      }
      rafRef.current = window.requestAnimationFrame(loop);
    };
    if (rafRef.current == null) {
      rafRef.current = window.requestAnimationFrame(loop);
    }
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [bids]);

  const makerAmountDisplay = (() => {
    try {
      return Number(formatEther(BigInt(String(makerWager ?? '0'))));
    } catch {
      return 0;
    }
  })();

  return (
    <div className="md:col-span-2 h-full min-h-0 flex flex-col">
      <div className="text-xs mt-0 mb-1">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Live Auction</span>
          {hasMultipleConditions ? (
            <div className="text-muted-foreground inline-flex items-center gap-1">
              <Info className="h-3 w-3 opacity-70" strokeWidth={2.5} />
              <span className="font-medium">
                Only one correct prediction needed to win
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs mb-2">
        <div className="inline-flex items-center gap-1 min-w-0">
          <span className="font-mono text-brand-white">
            {Number.isFinite(makerAmountDisplay)
              ? makerAmountDisplay.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'}{' '}
            {collateralAssetTicker}
          </span>
          <span className="text-muted-foreground">wager request</span>
          <span className="text-muted-foreground">from</span>
          <div className="inline-flex items-center gap-1 min-w-0">
            <EnsAvatar
              address={maker || ''}
              className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
              width={16}
              height={16}
            />
            <div className="min-w-0">
              <AddressDisplay address={maker || ''} compact />
            </div>
          </div>
        </div>
        <div />
      </div>
      <div className="flex-1 min-h-0">
        <AuctionBidsChart
          bids={displayBids}
          continuous
          refreshMs={refreshMs}
          makerWager={makerWager}
          maker={maker}
          collateralAssetTicker={collateralAssetTicker}
        />
      </div>
    </div>
  );
};

export default AuctionRequestChart;
