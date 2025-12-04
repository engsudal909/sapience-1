'use client';

import * as React from 'react';
import { parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { predictionMarketAbi } from '@sapience/sdk';
import { predictionMarket } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import PercentChance from '~/components/shared/PercentChance';
import {
  Table,
  TableBody,
  TableCell,
} from '@sapience/sdk/ui/components/ui/table';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/sdk/ui/components/ui/popover';
import { RefreshCw } from 'lucide-react';
import {
  useConditions,
  type ConditionType,
} from '~/hooks/graphql/useConditions';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketBadge from '~/components/markets/MarketBadge';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import hub from '~/lib/auction/useAuctionBidsHub';

type SuggestedBetslipsProps = {
  className?: string;
};

type ComboLeg = { condition: ConditionType; prediction: boolean };

type ComboWithQuote = {
  combo: ComboLeg[];
  auctionId: string | null;
  probability: number | null;
  status: 'pending' | 'requesting' | 'received' | 'error';
};

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as `0x${string}`;
const TAKER_WAGER_WEI = parseUnits('1', 18).toString();
const NUM_QUOTES_TO_REQUEST = 9;
const NUM_TO_DISPLAY = 3;

const SuggestedBetslips: React.FC<SuggestedBetslipsProps> = ({ className }) => {
  const chainId = useChainIdFromLocalStorage();
  const { data: allConditions = [], isLoading } = useConditions({
    take: 200,
    chainId,
  });
  const { addParlaySelection, clearParlaySelections } = useBetSlipContext();
  const { apiBaseUrl } = useSettings();
  const { address: walletAddress } = useAccount();

  const PREDICTION_MARKET_ADDRESS =
    predictionMarket[chainId]?.address ||
    predictionMarket[DEFAULT_CHAIN_ID]?.address;

  const selectedTakerAddress = walletAddress || ZERO_ADDRESS;

  const { data: takerNonce } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: selectedTakerAddress ? [selectedTakerAddress] : undefined,
    chainId: chainId,
    query: { enabled: !!selectedTakerAddress && !!PREDICTION_MARKET_ADDRESS },
  });

  const wsUrl = React.useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);

  // State for tracking quotes
  const [comboQuotes, setComboQuotes] = React.useState<ComboWithQuote[]>([]);
  const [hubTick, setHubTick] = React.useState(0);

  // Subscribe to hub updates
  React.useEffect(() => {
    if (wsUrl) hub.setUrl(wsUrl);
    const off = hub.addListener(() => setHubTick((t) => (t + 1) % 1_000_000));
    return () => off();
  }, [wsUrl]);

  const getCategoryColor = React.useCallback((slug?: string | null) => {
    return getCategoryStyle(slug).color;
  }, []);

  // Generate 9 random parlays
  const generateCombos = React.useCallback(
    (conditions: ConditionType[]): ComboLeg[][] => {
      const nowSec = Math.floor(Date.now() / 1000);
      const publicConditions = conditions.filter((c) => {
        if (!c.public) return false;
        const end = typeof c.endTime === 'number' ? c.endTime : 0;
        return end > nowSec;
      });
      if (publicConditions.length === 0) return [];

      const byCategory = publicConditions.reduce<
        Record<string, ConditionType[]>
      >((acc, c) => {
        const slug = c.category?.slug || 'uncategorized';
        if (!acc[slug]) acc[slug] = [];
        acc[slug].push(c);
        return acc;
      }, {});

      const categorySlugs = Object.keys(byCategory);
      function pickRandom<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
      }

      const makeOneCombo = (): ComboLeg[] => {
        const result: ComboLeg[] = [];
        const shuffledCats = [...categorySlugs].sort(() => Math.random() - 0.5);
        for (const cat of shuffledCats) {
          if (result.length >= 3) break;
          const pool = byCategory[cat];
          if (!pool || pool.length === 0) continue;
          result.push({
            condition: pickRandom(pool),
            prediction: Math.random() < 0.5,
          });
        }

        if (result.length < 3) {
          const usedIds = new Set(result.map((r) => r.condition.id));
          const remaining = publicConditions.filter((c) => !usedIds.has(c.id));
          while (result.length < 3 && remaining.length > 0) {
            const idx = Math.floor(Math.random() * remaining.length);
            const [picked] = remaining.splice(idx, 1);
            result.push({ condition: picked, prediction: Math.random() < 0.5 });
          }
        }

        return result.slice(0, 3);
      };

      return Array.from({ length: NUM_QUOTES_TO_REQUEST }, () =>
        makeOneCombo()
      );
    },
    []
  );

  // Request quotes for all combos
  const requestAllQuotes = React.useCallback(() => {
    if (!wsUrl || allConditions.length === 0) return;

    const combos = generateCombos(allConditions);
    if (combos.length === 0) return;

    const client = getSharedAuctionWsClient(wsUrl);
    const newQuotes: ComboWithQuote[] = combos.map((combo) => ({
      combo,
      auctionId: null,
      probability: null,
      status: 'pending' as const,
    }));

    setComboQuotes(newQuotes);

    // Request quotes with jittered timing
    for (let i = 0; i < combos.length; i++) {
      const combo = combos[i];
      const jitter = Math.floor(Math.random() * 200) + i * 100;

      setTimeout(async () => {
        try {
          const outcomes = combo.map((leg) => ({
            marketId: leg.condition.id,
            prediction: leg.prediction,
          }));
          const payload = buildAuctionStartPayload(outcomes, chainId);
          const requestPayload = {
            wager: TAKER_WAGER_WEI,
            resolver: payload.resolver,
            predictedOutcomes: payload.predictedOutcomes,
            taker: selectedTakerAddress,
            takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
            chainId: chainId,
          };

          setComboQuotes((prev) =>
            prev.map((q, idx) =>
              idx === i ? { ...q, status: 'requesting' as const } : q
            )
          );

          const response = await client.sendWithAck<{ auctionId?: string }>(
            'auction.start',
            requestPayload,
            { timeoutMs: 15000 }
          );

          const auctionId = response?.auctionId || null;
          if (auctionId) {
            hub.ensureSubscribed(auctionId);
          }

          setComboQuotes((prev) =>
            prev.map((q, idx) =>
              idx === i
                ? {
                    ...q,
                    auctionId,
                    status: auctionId ? 'requesting' : 'error',
                  }
                : q
            )
          );
        } catch {
          setComboQuotes((prev) =>
            prev.map((q, idx) =>
              idx === i ? { ...q, status: 'error' as const } : q
            )
          );
        }
      }, jitter);
    }
  }, [
    wsUrl,
    allConditions,
    generateCombos,
    chainId,
    selectedTakerAddress,
    takerNonce,
  ]);

  // Trigger quote requests when conditions load
  React.useEffect(() => {
    if (!isLoading && allConditions.length > 0) {
      requestAllQuotes();
    }
  }, [isLoading, allConditions.length, requestAllQuotes]);

  // Update probabilities from hub bids
  React.useEffect(() => {
    setComboQuotes((prev) =>
      prev.map((q) => {
        if (!q.auctionId) return q;
        const bids = hub.bidsByAuctionId.get(q.auctionId);
        if (!bids || bids.length === 0) return q;

        const nowMs = Date.now();
        const valid = bids.filter((b) => {
          const dl = Number(b?.makerDeadline || 0);
          return Number.isFinite(dl) ? dl * 1000 > nowMs : true;
        });
        const list = valid.length > 0 ? valid : bids;
        const best = list.reduce((acc, cur) => {
          return BigInt(cur.makerWager) > BigInt(acc.makerWager) ? cur : acc;
        }, list[0]);

        const taker = BigInt(TAKER_WAGER_WEI);
        const maker = BigInt(String(best?.makerWager || '0'));
        const denom = maker + taker;
        const prob = denom > 0n ? Number(maker) / Number(denom) : 0.5;
        // Allow probability to range from 0.1% to 99.9% to avoid division by zero
        // while enabling chance display from <1% to >99%
        const safeProbability = Math.max(0.001, Math.min(0.999, prob));

        return {
          ...q,
          probability: safeProbability,
          status: 'received' as const,
        };
      })
    );
  }, [hubTick]);

  // Get top 3 by highest payout (largest payout first)
  const topCombos = React.useMemo(() => {
    const withProbs = comboQuotes.filter(
      (q) => q.probability !== null && q.status === 'received'
    );

    // Sort descending by probability (highest = largest payout)
    const sorted = [...withProbs].sort(
      (a, b) => (b.probability ?? 0) - (a.probability ?? 0)
    );

    // Take top 3, or fall back to pending/requesting if not enough received
    if (sorted.length >= NUM_TO_DISPLAY) {
      return sorted.slice(0, NUM_TO_DISPLAY);
    }

    // Fill with combos that haven't received quotes yet
    const pending = comboQuotes.filter((q) => q.status !== 'received');
    return [...sorted, ...pending].slice(0, NUM_TO_DISPLAY);
  }, [comboQuotes]);

  const handlePickParlay = React.useCallback(
    (combo: ComboLeg[]) => {
      clearParlaySelections();
      combo.forEach((leg) => {
        addParlaySelection({
          conditionId: leg.condition.id,
          question: leg.condition.shortName || leg.condition.question,
          prediction: leg.prediction,
          categorySlug: leg.condition.category?.slug,
        });
      });
    },
    [clearParlaySelections, addParlaySelection]
  );

  return (
    <div className={'w-full ' + (className ?? '')}>
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="sc-heading text-foreground">Example combos</h2>
        <button
          type="button"
          onClick={requestAllQuotes}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          aria-label="Refresh combinations"
        >
          <RefreshCw className="h-4 w-4 text-accent-gold" />
        </button>
      </div>
      <div className="rounded-md border border-brand-white/20 overflow-hidden bg-brand-black">
        <Table className="w-full">
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading || topCombos.length === 0
                ? // Pulsing skeleton rows while loading
                  Array.from({ length: NUM_TO_DISPLAY }).map((_, idx) => (
                    <motion.tr
                      key={`skeleton-${idx}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="border-b border-brand-white/20"
                    >
                      {/* Desktop icons cell - hidden on mobile */}
                      <TableCell className="hidden md:table-cell py-3 pl-4 pr-3 w-[56px]">
                        <div
                          className="w-10 h-6 rounded bg-brand-white/5"
                          style={{
                            animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                            animationDelay: `${idx * 0.3}s`,
                          }}
                        />
                      </TableCell>
                      {/* Question cell - includes all content on mobile */}
                      <TableCell className="py-3 pl-4 md:pl-1 pr-4 md:pr-0">
                        <div className="flex flex-col gap-2">
                          {/* Mobile Row 1: Icons skeleton */}
                          <div
                            className="md:hidden w-10 h-6 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3}s`,
                            }}
                          />
                          {/* Row 2: Question skeleton */}
                          <div
                            className="w-48 h-5 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.1}s`,
                            }}
                          />
                          {/* Mobile Row 3: Probability skeleton */}
                          <div
                            className="md:hidden w-48 h-5 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.2}s`,
                            }}
                          />
                          {/* Mobile Row 4: Button skeleton */}
                          <div
                            className="md:hidden w-14 h-7 rounded bg-brand-white/5"
                            style={{
                              animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                              animationDelay: `${idx * 0.3 + 0.15}s`,
                            }}
                          />
                        </div>
                      </TableCell>
                      {/* Probability cell - desktop only */}
                      <TableCell className="hidden md:table-cell py-3 px-4">
                        <div
                          className="w-48 h-5 rounded bg-brand-white/5 ml-auto"
                          style={{
                            animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                            animationDelay: `${idx * 0.3 + 0.2}s`,
                          }}
                        />
                      </TableCell>
                      {/* Desktop button cell - hidden on mobile */}
                      <TableCell className="hidden md:table-cell py-3 pr-4 w-[70px]">
                        <div
                          className="w-14 h-7 rounded bg-brand-white/5"
                          style={{
                            animation: `suggestedRowPulse 2.4s ease-in-out infinite`,
                            animationDelay: `${idx * 0.3 + 0.15}s`,
                          }}
                        />
                      </TableCell>
                    </motion.tr>
                  ))
                : topCombos.map((item) => {
                    const { combo, probability, status } = item;
                    const colors = combo.map((leg) =>
                      getCategoryColor(leg.condition.category?.slug)
                    );
                    // Create a stable key from condition IDs and predictions
                    const comboKey = combo
                      .map(
                        (leg) =>
                          `${leg.condition.id}-${leg.prediction ? 'y' : 'n'}`
                      )
                      .join('_');

                    return (
                      <motion.tr
                        key={comboKey}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="border-b border-brand-white/20 hover:bg-transparent"
                      >
                        {/* Desktop icons cell - hidden on mobile */}
                        <TableCell className="hidden md:table-cell py-3 pl-4 pr-3 w-[56px] shrink-0">
                          <div className="flex items-center -space-x-2">
                            {combo.map((leg, i) => {
                              const CategoryIcon = getCategoryIcon(
                                leg.condition.category?.slug
                              );
                              const color =
                                colors[i] || 'hsl(var(--muted-foreground))';
                              return (
                                <div
                                  key={`icon-${leg.condition.id}-${i}`}
                                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center ring-2 ring-background"
                                  style={{
                                    backgroundColor: color,
                                    zIndex: combo.length - i,
                                  }}
                                >
                                  <CategoryIcon className="h-3 w-3 text-white/80" />
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                        {/* Question cell - includes all content on mobile */}
                        <TableCell className="py-3 pl-4 md:pl-1 pr-4 md:pr-0 min-w-0">
                          <div className="flex flex-col gap-2 min-w-0">
                            {/* Mobile Row 1: Icons (on their own line) */}
                            <div className="flex md:hidden items-center -space-x-2">
                              {combo.map((leg, i) => {
                                const CategoryIcon = getCategoryIcon(
                                  leg.condition.category?.slug
                                );
                                const color =
                                  colors[i] || 'hsl(var(--muted-foreground))';
                                return (
                                  <div
                                    key={`icon-mobile-${leg.condition.id}-${i}`}
                                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center ring-2 ring-background"
                                    style={{
                                      backgroundColor: color,
                                      zIndex: combo.length - i,
                                    }}
                                  >
                                    <CategoryIcon className="h-3 w-3 text-white/80" />
                                  </div>
                                );
                              })}
                            </div>
                            {/* Row 2: Question + Badge + "and 2 others" (desktop: inline with icons) */}
                            <div className="flex items-center gap-2 flex-wrap md:gap-x-2">
                              <span className="text-sm max-w-[300px] truncate">
                                <ConditionTitleLink
                                  conditionId={combo[0].condition.id}
                                  title={
                                    combo[0].condition.shortName ||
                                    combo[0].condition.question
                                  }
                                  endTime={combo[0].condition.endTime}
                                  description={combo[0].condition.description}
                                  clampLines={1}
                                  useDialog
                                />
                              </span>
                              <Badge
                                variant="outline"
                                className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                                  combo[0].prediction
                                    ? 'border-emerald-500 bg-emerald-500/50 dark:bg-emerald-500/70 text-emerald-900 dark:text-white/90'
                                    : 'border-rose-500 bg-rose-500/50 dark:bg-rose-500/70 text-rose-900 dark:text-white/90'
                                }`}
                              >
                                {combo[0].prediction ? 'YES' : 'NO'}
                              </Badge>
                              {/* "and two others" popover */}
                              {combo.length > 1 && (
                                <>
                                  <span className="text-sm text-muted-foreground shrink-0">
                                    and
                                  </span>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 shrink-0 transition-colors"
                                      >
                                        2 others
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                                      align="start"
                                    >
                                      <div className="flex flex-col divide-y divide-brand-white/20">
                                        {combo.slice(1).map((leg, i) => {
                                          const displayQ =
                                            leg.condition.shortName ||
                                            leg.condition.question;
                                          return (
                                            <div
                                              key={leg.condition.id + '-' + i}
                                              className="flex items-center gap-3 px-3 py-2"
                                            >
                                              <MarketBadge
                                                label={displayQ}
                                                size={32}
                                                color={getCategoryColor(
                                                  leg.condition.category?.slug
                                                )}
                                                categorySlug={
                                                  leg.condition.category?.slug
                                                }
                                              />
                                              <ConditionTitleLink
                                                conditionId={leg.condition.id}
                                                title={displayQ}
                                                endTime={leg.condition.endTime}
                                                description={
                                                  leg.condition.description
                                                }
                                                clampLines={1}
                                                className="text-sm"
                                                useDialog
                                              />
                                              <Badge
                                                variant="outline"
                                                className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                                                  leg.prediction
                                                    ? 'border-emerald-500 bg-emerald-500/50 dark:bg-emerald-500/70 text-emerald-900 dark:text-white/90'
                                                    : 'border-rose-500 bg-rose-500/50 dark:bg-rose-500/70 text-rose-900 dark:text-white/90'
                                                }`}
                                              >
                                                {leg.prediction ? 'YES' : 'NO'}
                                              </Badge>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </>
                              )}
                            </div>
                            {/* Mobile Row 3: Probability info */}
                            <div className="md:hidden text-sm">
                              {status === 'received' && probability !== null ? (
                                <>
                                  <PercentChance
                                    probability={1 - probability}
                                    showLabel
                                    label="chance"
                                    className="font-mono text-ethena"
                                  />
                                  <span className="text-muted-foreground ml-1">
                                    implied by 1 USDe to win{' '}
                                  </span>
                                  <span className="text-brand-white font-medium font-mono">
                                    {(1 / (1 - probability)).toFixed(2)} USDe
                                  </span>
                                </>
                              ) : status === 'error' ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="text-foreground/70">
                                  Initializing auction...
                                </span>
                              )}
                            </div>
                            {/* Mobile Row 4: PICK button */}
                            <div className="md:hidden">
                              <Button
                                className="tracking-wider font-mono text-xs px-3 h-7 bg-brand-white text-brand-black"
                                variant="default"
                                size="sm"
                                type="button"
                                onClick={() => handlePickParlay(combo)}
                              >
                                PICK
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                        {/* Probability cell - desktop only */}
                        <TableCell className="hidden md:table-cell py-3 px-4 text-right whitespace-nowrap">
                          {status === 'received' && probability !== null ? (
                            <span className="text-sm">
                              <PercentChance
                                probability={1 - probability}
                                showLabel
                                label="chance"
                                className="font-mono text-ethena"
                              />
                              <span className="text-muted-foreground ml-1">
                                implied by 1 USDe to win{' '}
                              </span>
                              <span className="text-brand-white font-medium font-mono">
                                {(1 / (1 - probability)).toFixed(2)} USDe
                              </span>
                            </span>
                          ) : status === 'error' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-foreground/70">
                              Initializing auction...
                            </span>
                          )}
                        </TableCell>
                        {/* Desktop PICK button cell - hidden on mobile */}
                        <TableCell className="hidden md:table-cell py-3 pr-4 w-[70px]">
                          <Button
                            className="tracking-wider font-mono text-xs px-3 h-7 bg-brand-white text-brand-black"
                            variant="default"
                            size="sm"
                            type="button"
                            onClick={() => handlePickParlay(combo)}
                          >
                            PICK
                          </Button>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
      <hr className="gold-hr mt-8" />
    </div>
  );
};

export default SuggestedBetslips;
