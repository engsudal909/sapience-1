'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AuctionBid } from '~/lib/auction/useAuctionBids';
import { formatEther } from 'viem';
import TradePopoverContent from '~/components/terminal/TradePopoverContent';
import ExpiresInLabel from '~/components/terminal/ExpiresInLabel';

type Props = {
  bids: AuctionBid[];
  // Optional refresh interval in milliseconds to sync animation duration
  refreshMs?: number;
  // When true, use requestAnimationFrame to continuously update time window
  continuous?: boolean;
  makerWager?: string | null;
  maker?: string | null;
  collateralAssetTicker: string;
};

const AuctionBidsChart: React.FC<Props> = ({
  bids,
  refreshMs = 1000,
  continuous = false,
  makerWager,
  maker,
  collateralAssetTicker,
}) => {
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const makerEth = (() => {
    try {
      return Number(formatEther(BigInt(String(makerWager ?? '0'))));
    } catch {
      return 0;
    }
  })();

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
              data: {
                time: number;
                amount: number;
                takerAddress?: string;
                takerAmountEth?: number;
                endMs?: number;
              }[];
            };
          }
          const key = `${String((b as any)?.id ?? (b as any)?.takerTxHash ?? start)}-${end}`;
          return {
            key,
            start,
            end,
            data: [
              {
                time: start,
                amount,
                takerAddress: (b as any)?.taker || '',
                takerAmountEth: amount,
                endMs: end,
              },
              {
                time: end,
                amount,
                takerAddress: (b as any)?.taker || '',
                takerAmountEth: amount,
                endMs: end,
              },
            ],
          };
        })
        .filter(Boolean) as {
        key: string;
        start: number;
        end: number;
        data: {
          time: number;
          amount: number;
          takerAddress?: string;
          takerAmountEth?: number;
          endMs?: number;
        }[];
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
            strokeDasharray="1 3"
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
            domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.1 : 1)]}
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
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const p: any = payload[0]?.payload || {};
              const takerAmount = Number(p?.takerAmountEth || p?.amount || 0);
              const total = Number.isFinite(takerAmount)
                ? takerAmount + (Number.isFinite(makerEth) ? makerEth : 0)
                : 0;
              const pct =
                Number.isFinite(takerAmount) &&
                Number.isFinite(total) &&
                total > 0
                  ? Math.round((takerAmount / total) * 100)
                  : undefined;
              const endMs = Number(p?.endMs || 0);
              const timeNode =
                Number.isFinite(endMs) && endMs > 0 ? (
                  <ExpiresInLabel endMs={endMs} nowMs={nowMs} />
                ) : undefined;
              return (
                <div className="rounded-md bg-background border border-border px-3 py-2.5">
                  <TradePopoverContent
                    leftAddress={String(p?.takerAddress || '')}
                    rightAddress={String(maker || '')}
                    takerAmountEth={takerAmount}
                    totalAmountEth={total}
                    percent={pct}
                    ticker={collateralAssetTicker}
                    timeNode={timeNode}
                  />
                </div>
              );
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
          {/* Dotted vertical line at current time (center "NOW") */}
          <ReferenceLine
            x={nowMs}
            stroke={'hsl(var(--brand-white))'}
            strokeDasharray="1 3"
            strokeWidth={1}
            className="now-ref-line"
            isFront
            ifOverflow="hidden"
          />
        </AreaChart>
      </ResponsiveContainer>
      <style jsx>{`
        :global(.now-ref-line .recharts-reference-line-line) {
          stroke-dasharray: 1 3;
          animation: nowLineDash 1.4s linear infinite;
        }
        @keyframes nowLineDash {
          to {
            stroke-dashoffset: 8;
          }
        }
      `}</style>
    </div>
  );
};

export default AuctionBidsChart;
