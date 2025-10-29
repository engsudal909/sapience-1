'use client';

import type React from 'react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  formatEther,
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getAddress,
} from 'viem';
import { Pin } from 'lucide-react';
import {
  TransactionAmountCell,
  type UiTransaction,
} from '~/components/markets/DataDrawer/TransactionCells';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useAuctionBids } from '~/lib/auction/useAuctionBids';
import AuctionBidsChart from '~/components/terminal/AuctionBidsChart';
import PlaceBidForm from '~/components/terminal/PlaceBidForm';
import ToWinLine from '~/components/terminal/ToWinLine';
import { useAccount, useSignTypedData } from 'wagmi';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { predictionMarket } from '@sapience/sdk/contracts';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';

type Props = {
  uiTx: UiTransaction;
  predictionsContent: React.ReactNode;
  auctionId: string | null;
  makerWager: string | null;
  maker: string | null;
  resolver: string | null;
  predictedOutcomes: string[];
  makerNonce: number | null;
  collateralAssetTicker: string;
  onTogglePin?: (auctionId: string | null) => void;
  isPinned?: boolean;
};

const AuctionRequestRow: React.FC<Props> = ({
  uiTx,
  predictionsContent,
  auctionId,
  makerWager,
  maker,
  resolver,
  predictedOutcomes,
  makerNonce,
  collateralAssetTicker,
  onTogglePin,
  isPinned,
}) => {
  const { bids } = useAuctionBids(auctionId);
  const [now, setNow] = useState<number>(Date.now());
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const verifyingContract = predictionMarket[DEFAULT_CHAIN_ID]?.address as
    | `0x${string}`
    | undefined;
  const { toast } = useToast();

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

  const lastBid = useMemo(() => {
    if (!Array.isArray(bids) || bids.length === 0) return null as any;
    return bids.reduce((latest, b) => {
      const t = Number(b?.receivedAtMs || 0);
      const lt = Number((latest as any)?.receivedAtMs || 0);
      return t > lt ? b : latest;
    }, bids[0]);
  }, [bids]);

  // Compute highest taker bid in display units
  const highestTakerBidDisplay = useMemo(() => {
    try {
      if (!Array.isArray(bids) || bids.length === 0) return 0;
      const maxWei = bids.reduce((m, b) => {
        try {
          const v = BigInt(String((b as any)?.takerWager ?? '0'));
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

  const submitBid = useCallback(
    async (data: {
      amount: string;
      expirySeconds: number;
      mode: 'duration' | 'datetime';
    }) => {
      try {
        if (!auctionId) return;
        // Ensure essential auction context
        const encodedPredicted =
          Array.isArray(predictedOutcomes) && predictedOutcomes[0]
            ? (predictedOutcomes[0] as `0x${string}`)
            : undefined;
        const makerAddr = typeof maker === 'string' ? maker : undefined;
        const resolverAddr =
          typeof resolver === 'string' ? resolver : undefined;
        const makerWagerWei = (() => {
          try {
            return BigInt(String(makerWager ?? '0'));
          } catch {
            return 0n;
          }
        })();
        const makerNonceVal =
          typeof makerNonce === 'number' ? makerNonce : undefined;
        if (
          !encodedPredicted ||
          !makerAddr ||
          !resolverAddr ||
          !makerNonceVal ||
          makerWagerWei <= 0n
        )
          return;

        // Ensure connected wallet
        let taker = address;
        if (!taker) {
          // eslint-disable-next-line @typescript-eslint/await-thenable
          await connectOrCreateWallet();
          // try to read again (wagmi state updates asynchronously)
          taker = (window as any)?.wagmi?.state?.address as
            | `0x${string}`
            | undefined;
        }
        if (!taker) return;

        // Amount in display units -> wei (assume 18)
        const takerWagerWei = parseUnits(String(data.amount || '0'), 18);
        if (takerWagerWei <= 0n) return;

        const takerDeadline =
          Math.floor(Date.now() / 1000) +
          Math.max(0, Number(data.expirySeconds || 0));

        // Build inner message hash (bytes, uint256, uint256, address, address, uint256)
        const innerMessageHash = keccak256(
          encodeAbiParameters(
            parseAbiParameters(
              'bytes, uint256, uint256, address, address, uint256'
            ),
            [
              encodedPredicted,
              takerWagerWei,
              makerWagerWei,
              getAddress(resolverAddr as `0x${string}`),
              getAddress(makerAddr as `0x${string}`),
              BigInt(takerDeadline),
            ]
          )
        );

        // EIP-712 domain and types per SignatureProcessor
        if (!verifyingContract) {
          toast({
            title: 'Signing failed',
            description: 'Missing verifying contract',
            variant: 'destructive' as any,
          });
          return;
        }
        const domain = {
          name: 'SignatureProcessor',
          version: '1',
          chainId: DEFAULT_CHAIN_ID,
          verifyingContract,
        } as const;
        const types = {
          Approve: [
            { name: 'messageHash', type: 'bytes32' },
            { name: 'owner', type: 'address' },
          ],
        } as const;
        const message = {
          messageHash: innerMessageHash,
          owner: getAddress(taker),
        } as const;

        // Sign typed data via wagmi/viem
        let takerSignature: `0x${string}` | null = null;
        try {
          takerSignature = await signTypedDataAsync({
            domain,
            types,
            primaryType: 'Approve',
            message,
          });
        } catch (e: any) {
          toast({
            title: 'Signature rejected',
            description: String(e?.message || e),
          });
          return;
        }
        if (!takerSignature) {
          toast({
            title: 'Signing failed',
            description: 'No signature returned',
            variant: 'destructive' as any,
          });
          return;
        }

        // Build bid payload
        const payload = {
          auctionId,
          taker,
          takerWager: takerWagerWei.toString(),
          takerDeadline,
          takerSignature,
          makerNonce: makerNonceVal,
        };

        // Send over Auction WS and await ack
        if (!wsUrl) return;
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const ws = new WebSocket(wsUrl);
          const timeout = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
              ws.close();
            } catch {
              void 0;
            }
            reject(new Error('ack_timeout'));
          }, 5000);
          ws.onopen = () => {
            try {
              ws.send(JSON.stringify({ type: 'bid.submit', payload }));
            } catch (e) {
              window.clearTimeout(timeout);
              if (!settled) {
                settled = true;
                try {
                  ws.close();
                } catch {
                  void 0;
                }
                reject(new Error(String(e)));
              }
            }
          };
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(String(ev.data));
              if (msg?.type === 'bid.ack') {
                window.clearTimeout(timeout);
                if (!settled) {
                  settled = true;
                  try {
                    ws.close();
                  } catch {
                    void 0;
                  }
                  if (msg?.payload?.error)
                    reject(new Error(String(msg.payload.error)));
                  else resolve();
                }
              }
            } catch {
              void 0;
            }
          };
          ws.onerror = () => {
            window.clearTimeout(timeout);
            if (!settled) {
              settled = true;
              try {
                ws.close();
              } catch {
                void 0;
              }
              reject(new Error('ws_error'));
            }
          };
          ws.onclose = () => {
            // no-op (handled by ack/timeout)
          };
        });
        toast({
          title: 'Bid submitted',
          description: 'Your bid was submitted successfully.',
        });
      } catch {
        toast({
          title: 'Bid failed',
          description: 'Unable to submit bid',
          variant: 'destructive' as any,
        });
      }
    },
    [
      auctionId,
      predictedOutcomes,
      maker,
      resolver,
      makerWager,
      makerNonce,
      address,
      connectOrCreateWallet,
      wsUrl,
      verifyingContract,
      signTypedDataAsync,
      toast,
    ]
  );

  return (
    <div className="p-4 relative group">
      <button
        type="button"
        onClick={() => onTogglePin?.(auctionId || null)}
        className={
          isPinned
            ? 'absolute top-2 right-2 inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground text-[10px] opacity-100'
            : 'absolute top-2 right-2 inline-flex items-center justify-center h-6 w-6 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] opacity-0 group-hover:opacity-100 transition-opacity'
        }
        aria-label={isPinned ? 'Unpin auction' : 'Pin auction'}
      >
        <Pin className="h-3 w-3" />
      </button>
      <div className="grid grid-cols-1 gap-2">
        <div>
          <div className="mb-2">{predictionsContent}</div>
        </div>
      </div>

      <motion.div
        className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      >
        <div className="md:col-span-1">
          <div className="flex items-center mb-2">
            <div className="text-xs inline-flex items-center gap-1 [&_span.font-mono]:text-brand-white">
              <span className="font-mono text-brand-white">
                {formattedMakerAmount} {collateralAssetTicker}
              </span>
              <span className="text-muted-foreground">wager from</span>
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
              highestTakerBidDisplay > 0
                ? highestTakerBidDisplay + 1
                : undefined
            }
            onSubmit={submitBid}
          />
          <div className="text-xs mb-2 mt-3">
            {lastTrade ? (
              <span>
                <span className="font-medium">Last Trade:</span>{' '}
                <ToWinLine
                  value={(() => {
                    try {
                      return Number(lastTrade.toWinStr.replace(/,/g, ''));
                    } catch {
                      return NaN;
                    }
                  })()}
                  ticker={collateralAssetTicker}
                  pct={lastTrade.pct}
                  asInline
                  textSize="text-xs"
                  className="align-baseline"
                />
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
                {bids.map((b, i) => {
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
                                toWinNumber = Number(
                                  formatEther(BigInt(toWinStr))
                                );
                              } catch {
                                toWinNumber = Number(toWinStr) || 0;
                              }
                              let pct: number | null = null;
                              try {
                                const maker = BigInt(String(makerWager ?? '0'));
                                const taker = BigInt(
                                  String(b?.takerWager ?? '0')
                                );
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
              </tbody>
            </table>
          </div>
        </div>
        <div className="md:col-span-1">
          <div className="h-[160px]">
            <AuctionBidsChart bids={bids} continuous refreshMs={250} />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuctionRequestRow;
