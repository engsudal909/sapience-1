'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { formatEther } from 'viem';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import PlaceBidForm from '~/components/terminal/PlaceBidForm';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@sapience/sdk/ui/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';

type SubmitData = {
  amount: string;
  expirySeconds: number;
  mode: 'duration' | 'datetime';
};

type Props = {
  uiTx: UiTransaction;
  bids: any[] | undefined;
  makerWager: string | null;
  collateralAssetTicker: string;
  onSubmit: (data: SubmitData) => void | Promise<void>;
  maxEndTimeSec?: number | null;
};

type BestBidProps = {
  uiTx: UiTransaction;
  sortedBids: any[];
  now: number;
  makerWager: string | null;
  collateralAssetTicker: string;
  lastTrade: { takerStr: string; toWinStr: string; pct?: number } | null;
  lastBid: any;
  lastTradeTimeAgo: string | null;
};

const BestBid: React.FC<BestBidProps> = ({
  uiTx,
  sortedBids,
  now,
  makerWager,
  collateralAssetTicker,
  lastTrade,
  lastBid,
  lastTradeTimeAgo,
}) => {
  return (
    <div>
      <div className="text-xs mt-0 mb-1">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Best Bid</span>
          <div className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground">Last Trade:</span>
            {typeof lastTrade?.pct === 'number' ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="font-mono text-brand-white underline decoration-dotted underline-offset-2 hover:opacity-90"
                  >
                    {lastTrade.pct}% Chance
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(520px,90vw)] md:w-[min(640px,90vw)] lg:w-[min(720px,90vw)] p-3"
                >
                  <LastTrade
                    uiTx={uiTx}
                    lastTrade={lastTrade}
                    lastBid={lastBid}
                    lastTradeTimeAgo={lastTradeTimeAgo}
                    collateralAssetTicker={collateralAssetTicker}
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>
      <div className="max-h-[160px] overflow-y-auto overflow-x-auto mt-0 rounded-md bg-background border border-border px-2 py-1">
        <table className="w-full text-xs">
          <tbody>
            {sortedBids.length > 0 ? (
              sortedBids.map((b, i) => {
                const deadlineSec = Number(b?.takerDeadline || 0);
                const countdown = (() => {
                  if (!Number.isFinite(deadlineSec) || deadlineSec <= 0)
                    return { label: '—', isExpired: false } as const;
                  const ms = deadlineSec * 1000;
                  if (ms > now) {
                    return {
                      label: formatDistanceToNowStrict(new Date(ms), {
                        unit: 'second',
                      }),
                      isExpired: false,
                    } as const;
                  }
                  return { label: 'Expired', isExpired: true } as const;
                })();
                const { isExpired } = countdown;
                const secondsRemaining = (() => {
                  if (!Number.isFinite(deadlineSec) || deadlineSec <= 0)
                    return null;
                  const ms = deadlineSec * 1000;
                  const diff = Math.max(0, Math.round((ms - now) / 1000));
                  return diff;
                })();
                const toWinStr = (() => {
                  try {
                    const maker = BigInt(String(makerWager ?? '0'));
                    const taker = BigInt(String(b?.takerWager ?? '0'));
                    return (maker + taker).toString();
                  } catch {
                    return String(b?.takerWager || '0');
                  }
                })();
                // removed unused uiTxAmount
                return (
                  <tr
                    key={i}
                    className={
                      i === 0
                        ? 'border-b last:border-b-0'
                        : 'border-t border-b last:border-b-0'
                    }
                  >
                    <td className="px-0 py-1.5 align-top" colSpan={2}>
                      {(() => {
                        let toWinNumber = 0;
                        let takerNumber = 0;
                        try {
                          toWinNumber = Number(formatEther(BigInt(toWinStr)));
                        } catch {
                          toWinNumber = Number(toWinStr) || 0;
                        }
                        try {
                          takerNumber = Number(
                            formatEther(BigInt(String(b?.takerWager ?? '0')))
                          );
                        } catch {
                          takerNumber = 0;
                        }
                        let pct: number | null = null;
                        try {
                          const maker = BigInt(String(makerWager ?? '0'));
                          const taker = BigInt(String(b?.takerWager ?? '0'));
                          const total = maker + taker;
                          if (total > 0n) {
                            const pctTimes100 = Number(
                              (taker * 10000n) / total
                            );
                            pct = Math.round(pctTimes100 / 100);
                          }
                        } catch {
                          /* noop */
                        }
                        const takerStr = Number.isFinite(takerNumber)
                          ? takerNumber.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—';
                        const toWinDisplay = Number.isFinite(toWinNumber)
                          ? toWinNumber.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—';
                        return (
                          <div>
                            <div className="flex items-baseline justify-between">
                              <span className="align-baseline">
                                <span className="font-mono text-brand-white">
                                  {takerStr} {collateralAssetTicker}
                                </span>{' '}
                                <span className="text-muted-foreground">
                                  to win
                                </span>{' '}
                                <span className="font-mono text-brand-white">
                                  {toWinDisplay} {collateralAssetTicker}
                                </span>
                              </span>
                              {typeof pct === 'number' ? (
                                <span className="font-mono text-brand-white">
                                  {pct}% Chance
                                </span>
                              ) : (
                                <span />
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-3 mt-0.5">
                              <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
                                <div className="inline-flex items-center gap-1 min-w-0">
                                  <EnsAvatar
                                    address={b?.taker || ''}
                                    className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                                    width={16}
                                    height={16}
                                  />
                                  <div className="min-w-0">
                                    <AddressDisplay
                                      address={b?.taker || ''}
                                      compact
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs">
                                {isExpired ? (
                                  <span className="text-red-600">Expired</span>
                                ) : secondsRemaining != null ? (
                                  <span>
                                    <span className="text-muted-foreground">
                                      expires in{' '}
                                    </span>
                                    <span className="font-mono text-brand-white">
                                      {secondsRemaining}s
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-brand-white">—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  className="px-0 py-2 text-xs text-muted-foreground"
                  colSpan={2}
                >
                  No bids yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type LastTradeProps = {
  uiTx: UiTransaction;
  lastTrade: { takerStr: string; toWinStr: string; pct?: number } | null;
  lastBid: any;
  lastTradeTimeAgo: string | null;
  collateralAssetTicker: string;
};

const LastTrade: React.FC<LastTradeProps> = ({
  uiTx,
  lastTrade,
  lastBid,
  lastTradeTimeAgo,
  collateralAssetTicker,
}) => {
  return (
    <div className="text-xs">
      {lastTrade ? (
        <div className="space-y-1">
          <div className="flex items-baseline">
            <span className="font-medium">Last Trade</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="align-baseline">
              <span className="font-mono text-brand-white">
                {lastTrade.takerStr} {collateralAssetTicker}
              </span>{' '}
              <span className="text-muted-foreground">to win</span>{' '}
              <span className="font-mono text-brand-white">
                {lastTrade.toWinStr} {collateralAssetTicker}
              </span>
            </span>
            {typeof lastTrade.pct === 'number' ? (
              <span className="font-mono text-brand-white">
                {lastTrade.pct}% Chance
              </span>
            ) : (
              <span />
            )}
          </div>
          <div className="flex items-center justify-between mt-0">
            <div className="inline-flex items-center gap-1 min-w-0 text-muted-foreground">
              <div className="inline-flex items-center gap-1 min-w-0">
                <EnsAvatar
                  address={lastBid?.taker || ''}
                  className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                  width={16}
                  height={16}
                />
                <div className="min-w-0">
                  <AddressDisplay address={lastBid?.taker || ''} compact />
                </div>
              </div>
              <span className="text-muted-foreground mx-0.5">versus</span>
              <div className="inline-flex items-center gap-1 min-w-0">
                <EnsAvatar
                  address={uiTx?.position?.owner || ''}
                  className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                  width={16}
                  height={16}
                />
                <div className="min-w-0">
                  <AddressDisplay
                    address={uiTx?.position?.owner || ''}
                    compact
                  />
                </div>
              </div>
            </div>
            {lastTradeTimeAgo ? (
              <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                {lastTradeTimeAgo}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <span>
          <span className="font-medium">Last Trade</span> —
        </span>
      )}
    </div>
  );
};

const AuctionRequestInfo: React.FC<Props> = ({
  uiTx,
  bids,
  makerWager,
  collateralAssetTicker,
  onSubmit,
  maxEndTimeSec,
}) => {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const makerAmountDisplay = useMemo(() => {
    try {
      return Number(formatEther(BigInt(String(makerWager ?? '0'))));
    } catch {
      return 0;
    }
  }, [makerWager]);

  const highestTakerBidDisplay = useMemo(() => {
    try {
      if (!Array.isArray(bids) || bids.length === 0) return 0;
      const maxWei = bids.reduce((m, b) => {
        try {
          const v = BigInt(String(b?.takerWager ?? '0'));
          return v > m ? v : m;
        } catch {
          return m;
        }
      }, 0n);
      return Number(formatEther(maxWei));
    } catch {
      return 0;
    }
  }, [bids]);

  const lastBid = useMemo(() => {
    if (!Array.isArray(bids) || bids.length === 0) return null as any;
    return bids.reduce((latest, b) => {
      const t = Number(b?.receivedAtMs || 0);
      const lt = Number(latest?.receivedAtMs || 0);
      return t > lt ? b : latest;
    }, bids[0]);
  }, [bids]);

  const lastTrade = useMemo(() => {
    try {
      if (!lastBid) return null;
      const maker = BigInt(String(makerWager ?? '0'));
      const taker = BigInt(String(lastBid?.takerWager ?? '0'));
      const takerEth = Number(formatEther(taker));
      const totalEth = Number(formatEther(maker + taker));
      const pct =
        Number.isFinite(takerEth) && Number.isFinite(totalEth) && totalEth > 0
          ? Math.round((takerEth / totalEth) * 100)
          : undefined;
      return {
        takerStr: takerEth.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        toWinStr: totalEth.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        pct,
      } as const;
    } catch {
      return null;
    }
  }, [lastBid, makerWager]);

  const lastTradeTimeAgo = useMemo(() => {
    try {
      const ms = Number(lastBid?.receivedAtMs || 0);
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return formatDistanceToNowStrict(new Date(ms), { addSuffix: true });
    } catch {
      return null;
    }
  }, [lastBid, now]);

  const maxDurationLabel = useMemo(() => {
    try {
      const endSec = Number(maxEndTimeSec || 0);
      if (!Number.isFinite(endSec) || endSec <= 0) return null;
      return formatDistanceToNowStrict(new Date(endSec * 1000));
    } catch {
      return null;
    }
  }, [maxEndTimeSec, now]);

  const winningBid = useMemo(() => {
    try {
      if (!Array.isArray(bids) || bids.length === 0) return null as any;
      const candidates = bids.filter((b) => {
        const deadlineSec = Number(b?.takerDeadline || 0);
        if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return true;
        return deadlineSec * 1000 > now;
      });
      if (candidates.length === 0) return null as any;
      return candidates.reduce((best, b) => {
        try {
          const cur = BigInt(String(b?.takerWager ?? '0'));
          const bestVal = BigInt(String(best?.takerWager ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, candidates[0]);
    } catch {
      return null as any;
    }
  }, [bids, now]);

  // No separate Highest Bid summary row; top bid appears first in the list below

  const sortedBids: any[] = useMemo(() => {
    const list = Array.isArray(bids) ? [...bids] : [];
    const withSortKey = list.map((b) => {
      let wager = 0n;
      try {
        wager = BigInt(String(b?.takerWager ?? '0'));
      } catch {
        wager = 0n;
      }
      return { ...b, __wager: wager };
    });
    withSortKey.sort((a, b) =>
      a.__wager < b.__wager ? 1 : a.__wager > b.__wager ? -1 : 0
    );
    // Ensure current winning (active highest) is first if present
    if (winningBid) {
      const idx = withSortKey.findIndex((x) => x === winningBid);
      if (idx > 0) {
        const [w] = withSortKey.splice(idx, 1);
        withSortKey.unshift(w);
      }
    }
    return withSortKey;
  }, [bids, winningBid]);

  // removed unused maxDurationLabel (handled in parent row)

  return (
    <div className="md:col-span-2">
      <div className="text-xs mt-1 mb-1">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Submit Bid</span>
          <div className="inline-flex items-baseline gap-1">
            <span className="text-muted-foreground">Maximum Duration:</span>
            <span className="font-mono text-brand-white">
              {maxDurationLabel ?? '—'}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-pointer self-center" />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <span>
                    Time remaining until the latest end time across all
                    conditions.
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
      <PlaceBidForm
        collateralAssetTicker={collateralAssetTicker}
        decimals={2}
        variant="compact"
        makerAmountDisplay={makerAmountDisplay}
        initialAmountDisplay={
          highestTakerBidDisplay > 0 ? highestTakerBidDisplay + 1 : undefined
        }
        onSubmit={onSubmit}
      />

      <div className="mt-1 pt-1">
        {/**
         * LastTrade temporarily disabled per request
         *
         * <div>
         *   <LastTrade
         *     uiTx={uiTx}
         *     lastTrade={lastTrade}
         *     lastBid={lastBid}
         *     lastTradeTimeAgo={lastTradeTimeAgo}
         *     collateralAssetTicker={collateralAssetTicker}
         *   />
         * </div>
         */}
        <div>
          <BestBid
            uiTx={uiTx}
            sortedBids={sortedBids}
            now={now}
            makerWager={makerWager}
            collateralAssetTicker={collateralAssetTicker}
            lastTrade={lastTrade}
            lastBid={lastBid}
            lastTradeTimeAgo={lastTradeTimeAgo}
          />
        </div>
      </div>
    </div>
  );
};

export default AuctionRequestInfo;
