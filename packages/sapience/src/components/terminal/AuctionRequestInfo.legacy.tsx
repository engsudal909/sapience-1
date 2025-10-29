'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { formatEther } from 'viem';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import PlaceBidForm from '~/components/terminal/PlaceBidForm';
import ToWinLine from '~/components/terminal/ToWinLine';
import {
  TransactionAmountCell,
  type UiTransaction,
} from '~/components/markets/DataDrawer/TransactionCells';

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
};

const AuctionRequestInfoLegacy: React.FC<Props> = ({
  uiTx,
  bids,
  makerWager,
  collateralAssetTicker,
  onSubmit,
}) => {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const formattedMakerAmount = useMemo(() => {
    try {
      const eth = Number(formatEther(BigInt(String(makerWager ?? '0'))));
      if (Number.isFinite(eth))
        return eth.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      return '0.00';
    } catch {
      return '0.00';
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

  const winningTrade = useMemo(() => {
    try {
      if (!winningBid) return null;
      const maker = BigInt(String(makerWager ?? '0'));
      const taker = BigInt(String(winningBid?.takerWager ?? '0'));
      const takerEth = Number(formatEther(taker));
      const totalEth = Number(formatEther(maker + taker));
      const pct =
        Number.isFinite(takerEth) && Number.isFinite(totalEth) && totalEth > 0
          ? Math.round((takerEth / totalEth) * 100)
          : undefined;
      return {
        takerStr: Number.isFinite(takerEth)
          ? takerEth.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '—',
        toWinStr: Number.isFinite(totalEth)
          ? totalEth.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : '—',
        pct,
      } as const;
    } catch {
      return null;
    }
  }, [winningBid, makerWager]);

  return (
    <div className="md:col-span-1">
      <div className="flex items-center mb-2">
        <div className="text-xs inline-flex items-center gap-1 [&_span.font-mono]:text-brand-white">
          <span className="font-mono text-brand-white">
            {formattedMakerAmount} {collateralAssetTicker}
          </span>
          <span className="text-muted-foreground">Wager request</span>
          <div className="inline-flex items-center gap-1">
            <EnsAvatar
              address={uiTx?.position?.owner || ''}
              className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
              width={16}
              height={16}
            />
            <AddressDisplay address={uiTx?.position?.owner || ''} compact />
          </div>
        </div>
      </div>
      <PlaceBidForm
        collateralAssetTicker={collateralAssetTicker}
        availableBalance={1234.56}
        decimals={2}
        variant="compact"
        makerAmountDisplay={(() => {
          try {
            return Number(formatEther(BigInt(String(makerWager ?? '0'))));
          } catch {
            return 0;
          }
        })()}
        initialAmountDisplay={
          highestTakerBidDisplay > 0 ? highestTakerBidDisplay + 1 : undefined
        }
        onSubmit={onSubmit}
      />
      <div className="text-xs mt-2">
        {winningTrade ? (
          <span className="align-baseline">
            <span className="font-medium">Winning Bid:</span>{' '}
            <span className="font-mono text-brand-white">
              {winningTrade.takerStr} {collateralAssetTicker}
            </span>{' '}
            <span className="text-muted-foreground">to win</span>{' '}
            <span className="font-mono text-brand-white">
              {winningTrade.toWinStr} {collateralAssetTicker}
            </span>
            {typeof winningTrade.pct === 'number' ? (
              <span className="text-muted-foreground">
                {' '}
                ({winningTrade.pct}% Chance)
              </span>
            ) : null}
          </span>
        ) : (
          <span>
            <span className="font-medium">Winning Bid:</span> —
          </span>
        )}
      </div>
      <div className="text-xs mb-2 mt-3">
        {lastTrade ? (
          <span className="align-baseline">
            <span className="font-medium">Last Trade:</span>{' '}
            <span className="font-mono text-brand-white">
              {lastTrade.takerStr} {collateralAssetTicker}
            </span>{' '}
            <span className="text-muted-foreground">to win</span>{' '}
            <span className="font-mono text-brand-white">
              {lastTrade.toWinStr} {collateralAssetTicker}
            </span>
            {typeof lastTrade.pct === 'number' ? (
              <span className="text-muted-foreground">
                {' '}
                ({lastTrade.pct}% Chance)
              </span>
            ) : null}
          </span>
        ) : (
          <span>
            <span className="font-medium">Last Trade:</span> —
          </span>
        )}
      </div>
      <div className="max-h-[120px] overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {(winningBid ? [winningBid] : []).map((b, i) => {
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
              const uiTxAmount = {
                id: i,
                type: 'FORECAST',
                createdAt: new Date().toISOString(),
                collateral: String(b?.takerWager || '0'),
                position: { owner: b?.taker || '' },
              } as unknown as UiTransaction;
              return (
                <tr key={i} className="border-y">
                  <td className="px-0 py-2 whitespace-nowrap align-top">
                    <div className="flex flex-col">
                      <div className="text-xs text-brand-white font-mono">
                        <TransactionAmountCell
                          tx={uiTxAmount}
                          collateralAssetTicker={collateralAssetTicker}
                        />
                      </div>
                      <div className="mt-0.5">
                        {(() => {
                          let toWinNumber = 0;
                          try {
                            toWinNumber = Number(formatEther(BigInt(toWinStr)));
                          } catch {
                            toWinNumber = Number(toWinStr) || 0;
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
                          return (
                            <ToWinLine
                              value={toWinNumber}
                              ticker={collateralAssetTicker}
                              pct={pct ?? undefined}
                              textSize="text-xs"
                            />
                          );
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="px-0 py-2">
                    <div className="mb-1 font-mono text-xs">
                      {isExpired ? (
                        <span className="text-red-600">Expired</span>
                      ) : secondsRemaining != null ? (
                        <span className="text-brand-white">
                          expires in {secondsRemaining} seconds
                        </span>
                      ) : (
                        <span className="text-brand-white">—</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
                      <EnsAvatar
                        address={b?.taker || ''}
                        className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                        width={16}
                        height={16}
                      />
                      <div className="min-w-0">
                        <AddressDisplay address={b?.taker || ''} compact />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!winningBid ? (
              <tr>
                <td
                  className="px-0 py-2 text-xs text-muted-foreground"
                  colSpan={2}
                >
                  No active bids
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuctionRequestInfoLegacy;
