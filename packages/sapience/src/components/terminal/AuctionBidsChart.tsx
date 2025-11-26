'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
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
  takerWager?: string | null;
  taker?: string | null;
  collateralAssetTicker: string;
};

const AuctionBidsChart: React.FC<Props> = ({
  bids,
  refreshMs = 1000,
  continuous = false,
  takerWager,
  taker,
  collateralAssetTicker,
}) => {
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [hoveredBid, setHoveredBid] = useState<{
    x: number;
    y: number;
    data: {
      amount: number;
      makerAddress: string;
      endMs: number;
    };
  } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const takerEth = (() => {
    try {
      return Number(formatEther(BigInt(String(takerWager ?? '0'))));
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
            amount = Number(formatEther(BigInt(String(b?.makerWager ?? '0'))));
          } catch {
            amount = 0;
          }
          const start = Number(b?.receivedAtMs || 0);
          const end = Number(b?.makerDeadline || 0) * 1000;
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
                makerAddress?: string;
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
                makerAddress: b.maker || '',
                takerAmountEth: amount,
                endMs: end,
              },
              {
                time: end,
                amount,
                makerAddress: b.maker || '',
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
          makerAddress?: string;
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

  // Find the best (highest) active bid at a given x-coordinate (time)
  const findBestBidAtTime = useCallback(
    (timeMs: number) => {
      const activeBids = series.filter(
        (s) => timeMs >= s.start && timeMs <= s.end
      );
      if (activeBids.length === 0) return null;

      // Find the highest bid
      let best = activeBids[0];
      for (const bid of activeBids) {
        if (bid.data[0].amount > best.data[0].amount) {
          best = bid;
        }
      }
      return best.data[0];
    },
    [series]
  );

  // Handle mouse move to show custom tooltip (throttled for performance)
  const lastMoveRef = useRef<number>(0);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Throttle to ~60fps
      const now = performance.now();
      if (now - lastMoveRef.current < 16) return;
      lastMoveRef.current = now;

      const container = chartRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Chart area starts after Y axis (56px) and has padding (8px right, 0 left)
      const chartLeft = 56;
      const chartRight = rect.width - 8;
      const chartWidth = chartRight - chartLeft;
      const chartTop = 8;
      const chartBottom = rect.height - 20; // Account for X axis

      // Only show tooltip when hovering in the chart area
      if (
        mouseX < chartLeft ||
        mouseX > chartRight ||
        mouseY < chartTop ||
        mouseY > chartBottom
      ) {
        setHoveredBid(null);
        return;
      }

      // Map mouse X to time
      const relativeX = (mouseX - chartLeft) / chartWidth;
      const timeRange = xDomain[1] - xDomain[0];
      const timeMs = xDomain[0] + relativeX * timeRange;

      const bidData = findBestBidAtTime(timeMs);
      if (bidData) {
        setHoveredBid({
          x: e.clientX,
          y: e.clientY,
          data: {
            amount: bidData.amount,
            makerAddress: bidData.makerAddress || '',
            endMs: bidData.endMs || 0,
          },
        });
      } else {
        setHoveredBid(null);
      }
    },
    [xDomain, findBestBidAtTime]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredBid(null);
  }, []);

  // Calculate tooltip position to keep it in viewport
  const tooltipStyle = useMemo(() => {
    if (!hoveredBid) return {};
    const tooltipWidth = 280;
    const tooltipHeight = 80;
    const offset = 12;

    let left = hoveredBid.x + offset;
    let top = hoveredBid.y - tooltipHeight - offset;

    // Keep tooltip in viewport horizontally
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = hoveredBid.x - tooltipWidth - offset;
    }

    // Keep tooltip in viewport vertically
    if (top < 8) {
      top = hoveredBid.y + offset;
    }

    return {
      position: 'fixed' as const,
      left,
      top,
      zIndex: 50,
      pointerEvents: 'none' as const,
    };
  }, [hoveredBid]);

  return (
    <div
      ref={chartRef}
      className="h-full w-full relative cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
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
              if (!label) return <g />;
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

      {/* Custom tooltip that shows best bid at hovered position */}
      {hoveredBid && (
        <div
          style={tooltipStyle}
          className="rounded-md bg-background border border-border px-3 py-2.5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
        >
          <TradePopoverContent
            leftAddress={hoveredBid.data.makerAddress}
            rightAddress={String(taker || '')}
            takerAmountEth={hoveredBid.data.amount}
            totalAmountEth={
              hoveredBid.data.amount +
              (Number.isFinite(takerEth) ? takerEth : 0)
            }
            percent={
              hoveredBid.data.amount + takerEth > 0
                ? Math.round(
                    (hoveredBid.data.amount /
                      (hoveredBid.data.amount + takerEth)) *
                      100
                  )
                : undefined
            }
            ticker={collateralAssetTicker}
            timeNode={
              hoveredBid.data.endMs > 0 ? (
                <ExpiresInLabel endMs={hoveredBid.data.endMs} nowMs={nowMs} />
              ) : undefined
            }
          />
        </div>
      )}

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
