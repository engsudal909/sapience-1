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

  const series = useMemo(
    () =>
      bids
        .map((b) => {
          let amount = 0;
          try {
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
            return null as null | {
              key: string;
              start: number;
              end: number;
              data: { time: number; amount: number }[];
            };
          }
          const key = `${String((b as any)?.id ?? (b as any)?.takerTxHash ?? start)}-${end}`;
          return {
            key,
            start,
            end,
            data: [
              { time: start, amount },
              { time: end, amount },
            ],
          };
        })
        .filter(Boolean) as {
        key: string;
        start: number;
        end: number;
        data: { time: number; amount: number }[];
      }[],
    [bids]
  );

  // Parent chart still requires a data array; each series overrides with its own data.
  const data = useMemo<{ time: number; amount: number }[]>(() => [], []);

  const xDomain = useMemo<[number, number]>(() => {
    const center = nowMs;
    const start = center - 60_000; // -1 minute
    const end = center + 60_000; // +1 minute
    return [start, end];
  }, [nowMs]);

  const xTicks = useMemo<number[]>(() => {
    const center = nowMs;
    return [center - 60_000, center, center + 60_000];
  }, [nowMs]);

  const seriesColor = useMemo(() => 'hsl(var(--ethena))', []);

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
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
            ticks={xTicks}
            interval={0}
            allowDataOverflow
            allowDecimals={false}
            height={20}
            tickMargin={6}
            tick={(props: any) => {
              const { x, y, payload } = props as {
                x: number;
                y: number;
                payload: { value: number };
              };
              const v = payload?.value;
              let label = '';
              let textAnchor: 'start' | 'middle' | 'end' = 'middle';
              let dx = 0;
              if (v === xTicks[0]) {
                label = '-1 min';
                textAnchor = 'start';
                dx = 4;
              } else if (v === xTicks[1]) {
                label = 'NOW';
                textAnchor = 'middle';
                dx = 0;
              } else if (v === xTicks[2]) {
                label = '+1 min';
                textAnchor = 'end';
                dx = -4;
              }
              if (!label) return null;
              return (
                <text
                  x={x}
                  y={y}
                  dx={dx}
                  dy={6}
                  textAnchor={textAnchor}
                  fontSize={10}
                  fontFamily={
                    'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
                  }
                  fill={'hsl(var(--brand-white))'}
                >
                  {label}
                </text>
              );
            }}
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
          {series.map((s) => {
            const isNew =
              nowMs - s.start < Math.max(300, Math.min(1200, refreshMs * 2));
            return (
              <Area
                key={s.key}
                type="stepAfter"
                data={s.data}
                dataKey="amount"
                stroke={seriesColor}
                strokeWidth={1.5}
                fillOpacity={0.2}
                fill="url(#colorBid)"
                isAnimationActive={isNew}
                animationBegin={0}
                animationDuration={isNew ? 500 : 0}
                animationEasing="ease-out"
                dot={false}
                activeDot={false}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AuctionBidsChart;
