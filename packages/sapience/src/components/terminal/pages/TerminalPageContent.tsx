'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { decodeAbiParameters, parseUnits } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import AuctionRequestRow from '~/components/terminal/AuctionRequestRow';
import AutoBid from '~/components/terminal/AutoBid';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useCategories } from '~/hooks/graphql/useMarketGroups';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/sdk/ui/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@sapience/sdk/ui/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import MarketBadge from '~/components/markets/MarketBadge';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import { Input } from '@sapience/sdk/ui/components/ui/input';

const TerminalPageContent: React.FC = () => {
  const { messages } = useAuctionRelayerFeed({ observeVaultQuotes: false });

  const [pinnedAuctions, setPinnedAuctions] = useState<string[]>([]);
  const [minWager, setMinWager] = useState<string>('1');
  const [minBids, setMinBids] = useState<string>('1');
  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<string[]>(
    []
  );
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>(
    []
  );
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([]);

  const togglePin = useCallback((auctionId: string | null) => {
    if (!auctionId) return;
    setPinnedAuctions((prev) => {
      const exists = prev.includes(auctionId);
      if (exists) return prev.filter((id) => id !== auctionId);
      return [...prev, auctionId];
    });
  }, []);

  const displayMessages = useMemo(() => {
    return [...messages].sort((a, b) => Number(b.time) - Number(a.time));
  }, [messages]);

  const auctionAndBidMessages = useMemo(() => {
    return displayMessages.filter(
      (m) => m.type === 'auction.started' || m.type === 'auction.bids'
    );
  }, [displayMessages]);

  const getAuctionId = useCallback((m: any): string | null => {
    return (
      (m?.channel as string) ||
      (m?.data?.auctionId as string) ||
      (m?.data?.payload?.auctionId as string) ||
      (m?.auctionId as string) ||
      null
    );
  }, []);

  // Build maps for last activity and latest started message per auction
  const { lastActivityByAuction, latestStartedByAuction } = useMemo(() => {
    const lastActivity = new Map<string, number>();
    const latestStarted = new Map<string, any>();
    for (const m of auctionAndBidMessages) {
      const id = getAuctionId(m as any);
      if (!id) continue;
      const t = Number((m as any)?.time || 0);
      const prev = lastActivity.get(id) || 0;
      if (t > prev) lastActivity.set(id, t);
      if (m.type === 'auction.started') {
        const prevStarted = latestStarted.get(id);
        if (!prevStarted || Number(prevStarted?.time || 0) < t) {
          latestStarted.set(id, m);
        }
      }
    }
    return {
      lastActivityByAuction: lastActivity,
      latestStartedByAuction: latestStarted,
    };
  }, [auctionAndBidMessages, getAuctionId]);

  // Collect unique conditionIds from auction.started messages for enrichment
  const conditionIds = useMemo(() => {
    const set = new Set<string>();
    try {
      for (const m of auctionAndBidMessages) {
        if (m.type !== 'auction.started') continue;
        const arr = Array.isArray((m as any)?.data?.predictedOutcomes)
          ? ((m as any).data.predictedOutcomes as unknown as string[])
          : [];
        if (arr.length === 0) continue;
        try {
          const decodedUnknown = decodeAbiParameters(
            [
              {
                type: 'tuple[]',
                components: [
                  { name: 'marketId', type: 'bytes32' },
                  { name: 'prediction', type: 'bool' },
                ],
              },
            ] as const,
            arr[0] as `0x${string}`
          ) as unknown;
          const decodedArr = Array.isArray(decodedUnknown)
            ? ((decodedUnknown as any)[0] as Array<{ marketId: string }>)
            : [];
          for (const o of decodedArr || []) {
            const id = (o as any)?.marketId as string | undefined;
            if (id && typeof id === 'string') set.add(id);
          }
        } catch {
          /* noop */
        }
      }
    } catch {
      /* noop */
    }
    return Array.from(set);
  }, [auctionAndBidMessages]);

  // Query conditions to enrich shortName/question for decoded predicted outcomes
  const { data: conditions = [] } = useQuery<
    {
      id: string;
      shortName?: string | null;
      question?: string | null;
      category?: { slug?: string | null } | null;
    }[],
    Error
  >({
    queryKey: ['terminalConditionsByIds', conditionIds.sort().join(',')],
    enabled: conditionIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1000) {
            id
            shortName
            question
            category {
              slug
            }
          }
        }
      `;
      const resp = await graphqlRequest<{
        conditions: Array<{
          id: string;
          shortName?: string | null;
          question?: string | null;
        }>;
      }>(CONDITIONS_BY_IDS, { ids: conditionIds });
      return resp?.conditions || [];
    },
  });

  const conditionMap = useMemo(() => {
    return new Map(conditions.map((c) => [c.id, c]));
  }, [conditions]);

  // Categories for multi-select
  const { data: categories = [] } = useCategories();

  // Reusable MultiSelect component
  const MultiSelect: React.FC<{
    placeholder: string;
    items: { value: string; label: string }[];
    selected: string[];
    onChange: (values: string[]) => void;
  }> = ({ placeholder, items, selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const toggle = useCallback(
      (value: string) => {
        onChange(
          selected.includes(value)
            ? selected.filter((v) => v !== value)
            : [...selected, value]
        );
      },
      [onChange, selected]
    );
    const summary =
      selected.length === 0 ? placeholder : `${selected.length} selected`;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-8 w-full rounded-md border border-border bg-background px-3 text-left text-sm inline-flex items-center justify-between"
          >
            <span
              className={selected.length === 0 ? 'text-muted-foreground' : ''}
            >
              {summary}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>No options</CommandEmpty>
              <CommandGroup>
                {items.map((it) => {
                  const isSelected = selected.includes(it.value);
                  return (
                    <CommandItem
                      key={it.value}
                      onSelect={() => toggle(it.value)}
                      className="flex items-center justify-between"
                    >
                      <span>{it.label}</span>
                      <Check
                        className={
                          isSelected
                            ? 'h-4 w-4 opacity-100'
                            : 'h-4 w-4 opacity-0'
                        }
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  // Freeform multi-select for addresses (placeholder; accepts any text input)
  const AddressesMultiSelect: React.FC<{
    placeholder?: string;
    selected: string[];
    onChange: (values: string[]) => void;
  }> = ({ placeholder = 'All addresses', selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');

    const addAddress = useCallback(() => {
      const v = inputValue.trim();
      if (!v) return;
      if (!selected.includes(v)) onChange([...selected, v]);
      setInputValue('');
    }, [inputValue, onChange, selected]);

    const removeAddress = useCallback(
      (addr: string) => {
        onChange(selected.filter((a) => a !== addr));
      },
      [onChange, selected]
    );

    const summary =
      selected.length === 0 ? placeholder : `${selected.length} selected`;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-8 w-full rounded-md border border-border bg-background px-3 text-left text-sm inline-flex items-center justify-between"
          >
            <span
              className={selected.length === 0 ? 'text-muted-foreground' : ''}
            >
              {summary}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b border-border/60">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type address and press Enter"
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAddress();
                }
              }}
            />
          </div>
          <Command>
            <CommandList>
              <CommandGroup heading="Selected">
                {selected.length === 0 ? (
                  <CommandItem disabled>No addresses added</CommandItem>
                ) : (
                  selected.map((addr) => (
                    <CommandItem
                      key={addr}
                      onSelect={() => removeAddress(addr)}
                      className="flex items-center justify-between"
                    >
                      <span className="font-mono text-xs">{addr}</span>
                      <Check className="h-4 w-4 opacity-100" />
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  function renderPredictionsCell(m: { type: string; data: any }) {
    try {
      if (m.type !== 'auction.started')
        return <span className="text-muted-foreground">—</span>;
      const arr = Array.isArray((m as any)?.data?.predictedOutcomes)
        ? ((m as any).data.predictedOutcomes as unknown as string[])
        : [];
      if (arr.length === 0)
        return <span className="text-muted-foreground">—</span>;
      const decodedUnknown = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [
              { name: 'marketId', type: 'bytes32' },
              { name: 'prediction', type: 'bool' },
            ],
          },
        ] as const,
        arr[0] as `0x${string}`
      ) as unknown;
      const decodedArr = Array.isArray(decodedUnknown)
        ? ((decodedUnknown as any)[0] as Array<{
            marketId: `0x${string}`;
            prediction: boolean;
          }>)
        : [];
      const legs = (decodedArr || []).map((o) => {
        const cond = conditionMap.get(o.marketId);
        return {
          id: o.marketId,
          title: cond?.shortName ?? cond?.question ?? o.marketId,
          categorySlug: cond?.category?.slug ?? null,
          choice: o.prediction ? ('Yes' as const) : ('No' as const),
        };
      });
      if (legs.length === 0)
        return <span className="text-muted-foreground">—</span>;
      return (
        <div className="overflow-x-auto">
          <div className="flex items-center gap-3 md:gap-4 whitespace-nowrap pr-4 text-sm">
            {legs.map((leg, i) => (
              <div key={i} className="inline-flex items-center gap-3 shrink-0">
                <MarketBadge
                  label={String(leg.title)}
                  size={28}
                  categorySlug={leg.categorySlug || undefined}
                  color={
                    leg.categorySlug
                      ? getCategoryStyle(leg.categorySlug)?.color
                      : undefined
                  }
                />
                <ConditionTitleLink
                  conditionId={leg.id}
                  title={String(leg.title)}
                  className="text-sm"
                  clampLines={1}
                />
                <span
                  className={
                    leg.choice === 'Yes'
                      ? 'px-2 py-1 text-xs font-medium font-mono border border-green-500/40 bg-green-500/10 text-green-600 rounded'
                      : 'px-2 py-1 text-xs font-medium font-mono border border-red-500/40 bg-red-500/10 text-red-600 rounded'
                  }
                >
                  {leg.choice}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    } catch {
      return <span className="text-muted-foreground">—</span>;
    }
  }

  const collateralAssetTicker = 'testUSDe';
  const minWagerWei = useMemo(() => {
    try {
      return parseUnits(minWager || '0', 18);
    } catch {
      return 0n;
    }
  }, [minWager]);

  const minBidsNum = useMemo(() => {
    const n = parseInt(minBids || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [minBids]);

  const bidsCountByAuction = useMemo(() => {
    const map = new Map<string, number>();
    // auctionAndBidMessages is sorted by time desc; first seen per id is latest
    for (const m of auctionAndBidMessages) {
      const id = getAuctionId(m as any);
      if (!id) continue;
      if (m.type === 'auction.bids') {
        const count = Array.isArray((m as any)?.data?.bids)
          ? ((m as any).data.bids as unknown as any[]).length
          : 0;
        if (!map.has(id)) map.set(id, count);
      }
    }
    return map;
  }, [auctionAndBidMessages, getAuctionId]);

  // Keep the list area under Filters at its initial height and scroll when content grows
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [initialMaxHeight, setInitialMaxHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      try {
        const h = el.offsetHeight;
        if (Number.isFinite(h) && h > 0) setInitialMaxHeight(h);
      } catch {
        /* noop */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function toUiTx(m: { time: number; type: string; data: any }): UiTransaction {
    const createdAt = new Date(m.time).toISOString();
    if (m.type === 'auction.started') {
      const maker = (m as any)?.data?.maker || '';
      const wager = (m as any)?.data?.wager || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(wager || '0'),
        position: { owner: maker },
      } as UiTransaction;
    }
    if (m.type === 'auction.bids') {
      const bids = Array.isArray((m as any)?.data?.bids)
        ? ((m as any).data.bids as unknown as any[])
        : [];
      const top = bids.reduce((best, b) => {
        try {
          const cur = BigInt(String(b?.takerWager ?? '0'));
          const bestVal = BigInt(String(best?.takerWager ?? '0'));
          return cur > bestVal ? b : best;
        } catch {
          return best;
        }
      }, bids[0] || null);
      const taker = top?.taker || '';
      const takerWager = top?.takerWager || '0';
      return {
        id: m.time,
        type: 'FORECAST',
        createdAt,
        collateral: String(takerWager || '0'),
        position: { owner: taker },
      } as UiTransaction;
    }
    return {
      id: m.time,
      type: 'FORECAST',
      createdAt,
      collateral: '0',
      position: { owner: '' },
    } as UiTransaction;
  }

  return (
    <div className="px-4 md:px-6 pb-4 md:pb-6 h-full min-h-0">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full min-h-0">
        <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black md:col-span-3 flex flex-col h-full min-h-0">
          <div className="flex-none">
            <div className="pl-4 pr-3 py-3 border-b border-border/60 bg-muted/10">
              <div className="flex items-center gap-4">
                <div className="eyebrow text-foreground">Filters</div>
                <div className="grid gap-3 md:grid-cols-5 flex-1">
                  {/* Minimum Wager */}
                  <div className="flex flex-col md:col-span-1">
                    <div className="flex">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        className="h-8 rounded-r-none border-r-0"
                        value={minWager}
                        onChange={(e) => setMinWager(e.target.value)}
                      />
                      <span className="inline-flex items-center h-8 rounded-md rounded-l-none border border-input border-l-0 bg-muted/30 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        Min. Wager
                      </span>
                    </div>
                  </div>

                  {/* Minimum Bids */}
                  <div className="flex flex-col md:col-span-1">
                    <div className="flex">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        className="h-8 rounded-r-none border-r-0"
                        value={minBids}
                        onChange={(e) => setMinBids(e.target.value)}
                      />
                      <span className="inline-flex items-center h-8 rounded-md rounded-l-none border border-input border-l-0 bg-muted/30 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {minBidsNum === 1 ? 'Min. Bid' : 'Min. Bids'}
                      </span>
                    </div>
                  </div>

                  {/* Categories */}
                  <div className="flex flex-col md:col-span-1">
                    <MultiSelect
                      placeholder="All categories"
                      items={(categories || []).map((c) => ({
                        value: c.slug,
                        label: c.name || c.slug,
                      }))}
                      selected={selectedCategorySlugs}
                      onChange={setSelectedCategorySlugs}
                    />
                  </div>

                  {/* Conditions with mode */}
                  <div className="flex flex-col md:col-span-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <MultiSelect
                          placeholder="All conditions"
                          items={(conditions || []).map((c) => ({
                            value: c.id,
                            label:
                              (c.shortName as string) ||
                              (c.question as string) ||
                              c.id,
                          }))}
                          selected={selectedConditionIds}
                          onChange={setSelectedConditionIds}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Addresses (placeholder multi-select) */}
                  <div className="flex flex-col md:col-span-1">
                    <AddressesMultiSelect
                      placeholder="All addresses"
                      selected={selectedAddresses}
                      onChange={setSelectedAddresses}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            ref={scrollAreaRef}
            className="flex-1 min-h-0 overflow-y-auto flex flex-col"
            style={
              initialMaxHeight ? { maxHeight: initialMaxHeight } : undefined
            }
          >
            {auctionAndBidMessages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-24">
                <div className="flex flex-col items-center">
                  <span className="inline-flex items-center gap-1 text-brand-white font-mono">
                    <span className="inline-block h-[6px] w-[6px] rounded-full bg-brand-white opacity-80 animate-ping mr-1.5" />
                    <span>Listening for messages...</span>
                  </span>
                  <p className="mt-2 text-xs text-brand-white/70">
                    <a
                      href="/markets"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-white underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 hover:decoration-brand-white/80"
                    >
                      Add predictions
                    </a>{' '}
                    to see its corresponding auction here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                <AnimatePresence initial={false} mode="popLayout">
                  {(() => {
                    const rows = Array.from(latestStartedByAuction.entries())
                      .map(([id, m]) => {
                        const lastActivity =
                          lastActivityByAuction.get(id) || Number(m?.time || 0);
                        const pinned = pinnedAuctions.includes(id);
                        return { id, m, lastActivity, pinned } as const;
                      })
                      .filter((row) => {
                        try {
                          const makerWagerWei = BigInt(
                            String(row.m?.data?.wager ?? '0')
                          );
                          const bidsCount = bidsCountByAuction.get(row.id) ?? 0;
                          if (bidsCount < minBidsNum) return false;
                          return makerWagerWei >= minWagerWei;
                        } catch {
                          return true;
                        }
                      });
                    rows.sort((a, b) => {
                      if (a.pinned && !b.pinned) return -1;
                      if (!a.pinned && b.pinned) return 1;
                      return b.lastActivity - a.lastActivity;
                    });
                    return rows.map((row, idx) => {
                      const auctionId = row.id;
                      const m = row.m;
                      const rowKey = `auction-${auctionId ?? idx}`;
                      return (
                        <motion.div
                          key={rowKey}
                          layout
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{
                            type: 'spring',
                            stiffness: 500,
                            damping: 40,
                            mass: 0.8,
                          }}
                        >
                          <AuctionRequestRow
                            uiTx={toUiTx(m)}
                            predictionsContent={renderPredictionsCell(m)}
                            auctionId={auctionId}
                            makerWager={String(m?.data?.wager ?? '0')}
                            maker={m?.data?.maker || null}
                            resolver={m?.data?.resolver || null}
                            predictedOutcomes={
                              Array.isArray(m?.data?.predictedOutcomes)
                                ? (m?.data?.predictedOutcomes as string[])
                                : []
                            }
                            makerNonce={
                              typeof m?.data?.makerNonce === 'number'
                                ? (m?.data?.makerNonce as number)
                                : null
                            }
                            collateralAssetTicker={collateralAssetTicker}
                            onTogglePin={togglePin}
                            isPinned={pinnedAuctions.includes(auctionId)}
                          />
                        </motion.div>
                      );
                    });
                  })()}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-6 md:col-span-1 h-full min-h-0">
          <AutoBid />
        </div>
      </div>
    </div>
  );
};

export default TerminalPageContent;
