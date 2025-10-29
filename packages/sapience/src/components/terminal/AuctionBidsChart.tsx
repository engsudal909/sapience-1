'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AuctionBid } from '~/lib/auction/useAuctionBids';
import { formatEther } from 'viem';
import { getChartColor } from '~/lib/theme/cssVars';

type Props = {
  bids: AuctionBid[];
  // Optional refresh interval in milliseconds to sync animation duration
  refreshMs?: number;
  // When true, use requestAnimationFrame to continuously update time window
  continuous?: boolean;
};

const AuctionBidsChart: React.FC<Props> = ({
  bids,
  refreshMs = 1000,
  continuous = false,
}) => {
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const collateralAssetTicker = 'testUSDe';

  useEffect(() => {
    if (continuous) {
      let rafId: number;
      let mounted = true;
      const tick = () => {
        if (!mounted) return;
        setNowMs(Date.now());
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => {
        mounted = false;
        cancelAnimationFrame(rafId);
      };
    } else {
      const id = setInterval(
        () => setNowMs(Date.now()),
        Math.max(16, refreshMs)
      );
      return () => clearInterval(id);
    }
  }, [continuous, refreshMs]);

  const data = useMemo(() => {
    // Build a line per bid from receivedAt to deadline with a constant Y = takerWager
    // We approximate by creating two points per bid.
    const points = bids
      .map((b) => {
        let amount = 0;
        try {
          // Convert from wei (1e18) to display units
          amount = Number(formatEther(BigInt(String(b?.takerWager ?? '0'))));
        } catch {
          amount = 0;
        }
        const start = Number(b?.receivedAtMs || 0);
        const end = Number(b?.takerDeadline || 0) * 1000;
        if (
          !Number.isFinite(amount) ||
          amount <= 0 ||
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          end <= 0
        ) {
          return [] as { x: number; y: number }[];
        }
        return [
          { x: start, y: amount },
          { x: end, y: amount },
        ];
      })
      .flat()
      .sort((a, b) => a.x - b.x);
    return points.map((p) => ({ time: p.x, amount: p.y }));
  }, [bids]);

  const xDomain = useMemo<[number, number]>(() => {
    const end = nowMs;
    const start = end - 30_000;
    return [start, end];
  }, [nowMs]);

  const seriesColor = useMemo(
    () => getChartColor(1) || 'hsl(var(--chart-1))',
    []
  );

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id="colorBid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={seriesColor} stopOpacity={0.6} />
              <stop offset="95%" stopColor={seriesColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgba(128,128,128,0.15)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={xDomain}
            allowDataOverflow
            tickFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            dataKey="amount"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            width={56}
            tickFormatter={(v) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return '';
              return n.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            }}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(20,20,20,0.9)',
              border: '1px solid rgba(128,128,128,0.3)',
            }}
            labelFormatter={(label) => new Date(Number(label)).toLocaleString()}
            formatter={(value) => {
              const n = Number(value as number);
              const text = Number.isFinite(n)
                ? `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${collateralAssetTicker}`
                : String(value);
              return [text, 'Amount'];
            }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={seriesColor}
            fillOpacity={1}
            fill="url(#colorBid)"
            isAnimationActive
            animationDuration={continuous ? 100 : refreshMs}
            animationEasing="linear"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AuctionBidsChart;
