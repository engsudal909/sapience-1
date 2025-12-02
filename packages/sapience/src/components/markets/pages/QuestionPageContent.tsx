'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import dynamic from 'next/dynamic';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';
import { DollarSign, ExternalLink } from 'lucide-react';
import {
  predictionMarket,
  umaResolver,
} from '@sapience/sdk/contracts/addresses';
import { motion, AnimatePresence } from 'framer-motion';
import { erc20Abi, formatUnits } from 'viem';
import { useReadContracts } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
import SafeMarkdown from '~/components/shared/SafeMarkdown';
import PredictionForm from './PredictionForm';
import Comments, { CommentFilters } from '~/components/shared/Comments';
import ConditionForecastForm from '~/components/conditions/ConditionForecastForm';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import { useSubmitParlay } from '~/hooks/forms/useSubmitParlay';

// Placeholder data for the scatterplot
const placeholderData = [
  { x: 10, y: 30 },
  { x: 20, y: 50 },
  { x: 30, y: 35 },
  { x: 40, y: 70 },
  { x: 50, y: 45 },
  { x: 60, y: 60 },
  { x: 70, y: 55 },
  { x: 80, y: 80 },
  { x: 90, y: 65 },
  { x: 100, y: 75 },
];

const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

interface QuestionPageContentProps {
  conditionId: string;
}

export default function QuestionPageContent({
  conditionId,
}: QuestionPageContentProps) {
  const [refetchTrigger, setRefetchTrigger] = React.useState(0);

  // Fetch condition data
  const { data, isLoading, isError } = useQuery<
    {
      id: string;
      question: string;
      shortName?: string | null;
      endTime?: number | null;
      description?: string | null;
      category?: { slug: string } | null;
      chainId?: number | null;
    } | null,
    Error
  >({
    queryKey: ['conditionById', conditionId],
    enabled: Boolean(conditionId),
    queryFn: async () => {
      if (!conditionId) return null;
      const QUERY = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1) {
            id
            question
            shortName
            endTime
            description
            chainId
            category {
              slug
            }
          }
        }
      `;
      const resp = await graphqlRequest<{
        conditions: Array<{
          id: string;
          question: string;
          shortName?: string | null;
          endTime?: number | null;
          description?: string | null;
          category?: { slug: string } | null;
          chainId?: number | null;
        }>;
      }>(QUERY, { ids: [conditionId] });
      return resp?.conditions?.[0] || null;
    },
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const [isDescriptionExpanded, setIsDescriptionExpanded] =
    React.useState(false);

  const handleForecastSuccess = React.useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  // Determine chain ID from condition data or default
  const chainId = data?.chainId ?? DEFAULT_CHAIN_ID;

  // Get PredictionMarket address for this chain
  const predictionMarketAddress = predictionMarket[chainId]?.address;

  // Initialize auction start hook for RFQ quote management
  const { bids, requestQuotes, buildMintRequestDataFromBid } =
    useAuctionStart();

  // Fetch PredictionMarket configuration (collateral token, min collateral)
  const predictionMarketConfigRead = useReadContracts({
    contracts: [
      {
        address: predictionMarketAddress,
        abi: predictionMarketAbi,
        functionName: 'getConfig',
        chainId,
      },
    ],
    query: {
      enabled: !!predictionMarketAddress,
    },
  });

  // Extract collateral token address from config
  const collateralToken = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as { collateralToken: `0x${string}` } | undefined;
      return cfg?.collateralToken;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

  // Extract min collateral from config
  const minCollateralRaw = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as { minCollateral: bigint } | undefined;
      return cfg?.minCollateral;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

  // Check if we're on an Ethereal chain (native USDe)
  const isEtherealChain = useMemo(() => {
    return COLLATERAL_SYMBOLS[chainId] === 'USDe';
  }, [chainId]);

  // Fetch collateral token symbol and decimals (skip for Ethereal chains)
  const erc20MetaRead = useReadContracts({
    contracts: collateralToken
      ? [
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId,
          },
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId,
          },
        ]
      : [],
    query: { enabled: !!collateralToken && !isEtherealChain },
  });

  // Derive collateral symbol
  const collateralSymbol = useMemo(() => {
    if (isEtherealChain) {
      return COLLATERAL_SYMBOLS[chainId] || 'USDe';
    }
    const item = erc20MetaRead.data?.[0];
    if (item && item.status === 'success') {
      return String(item.result);
    }
    return 'USDe';
  }, [erc20MetaRead.data, isEtherealChain, chainId]);

  // Derive collateral decimals
  const collateralDecimals = useMemo(() => {
    if (isEtherealChain) {
      return 18;
    }
    const item = erc20MetaRead.data?.[1];
    if (item && item.status === 'success') {
      return Number(item.result);
    }
    return 18;
  }, [erc20MetaRead.data, isEtherealChain]);

  // Derive min wager as human-readable string
  const minWager = useMemo(() => {
    if (!minCollateralRaw) return undefined;
    try {
      return formatUnits(minCollateralRaw, collateralDecimals);
    } catch {
      return String(minCollateralRaw);
    }
  }, [minCollateralRaw, collateralDecimals]);

  // Initialize submit parlay hook for mint transaction
  const { submitParlay, isSubmitting: isParlaySubmitting } = useSubmitParlay({
    chainId,
    predictionMarketAddress: predictionMarketAddress,
    collateralTokenAddress: collateralToken as `0x${string}`,
    enabled: !!predictionMarketAddress && !!collateralToken,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full gap-4">
        <p className="text-destructive">Failed to load question.</p>
      </div>
    );
  }

  const displayTitle = data.question || data.shortName || '';

  // Get focus area styling
  const categorySlug = data.category?.slug;
  const categoryStyle = getCategoryStyle(categorySlug);
  const CategoryIcon = getCategoryIcon(categorySlug);

  // Helper to add alpha to colors
  const withAlpha = (c: string, alpha: number) => {
    const hexMatch = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
    if (hexMatch.test(c)) {
      const a = Math.max(0, Math.min(1, alpha));
      const aHex = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0');
      return `${c}${aHex}`;
    }
    const toSlashAlpha = (fn: 'hsl' | 'rgb', inside: string) =>
      `${fn}(${inside} / ${alpha})`;
    if (c.startsWith('hsl(')) return toSlashAlpha('hsl', c.slice(4, -1));
    if (c.startsWith('rgb(')) return toSlashAlpha('rgb', c.slice(4, -1));
    return c;
  };

  return (
    <div className="flex flex-col w-full min-h-[100dvh] pt-16">
      <div className="flex flex-col w-full px-4 md:px-6 lg:px-8 items-center">
        {/* Main content */}
        <div className="w-full max-w-[1200px] mt-8 md:mt-16">
          {/* Title */}
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-normal text-foreground mb-4 break-words">
            {displayTitle}
          </h1>

          {/* Badges Row: Category, Open Interest, End Time */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Focus Area Badge */}
            {categoryStyle.name && (
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium"
                style={{
                  backgroundColor: withAlpha(categoryStyle.color, 0.2),
                  boxShadow: `inset 0 0 0 1px ${withAlpha(categoryStyle.color, 0.4)}`,
                }}
              >
                <CategoryIcon
                  className="w-4 h-4"
                  style={{ color: categoryStyle.color }}
                />
                <span className="text-foreground">{categoryStyle.name}</span>
              </div>
            )}

            {/* Open Interest Badge */}
            {(() => {
              const isPastEndTime =
                typeof data.endTime === 'number' &&
                data.endTime > 0 &&
                Date.now() / 1000 >= data.endTime;
              return (
                <Badge
                  variant="outline"
                  className="h-9 items-center px-3.5 text-sm leading-none inline-flex bg-card border-brand-white/20 text-brand-white font-medium"
                >
                  <DollarSign className="h-4 w-4 mr-1 -mt-0.5" />
                  {isPastEndTime ? 'Peak Open Interest' : 'Open Interest'}
                  <span
                    aria-hidden="true"
                    className="hidden md:inline-block mx-2.5 h-4 w-px bg-muted-foreground/30"
                  />
                  <span className="whitespace-nowrap text-muted-foreground font-normal">
                    — USDe
                  </span>
                </Badge>
              );
            })()}

            {/* End Time Badge */}
            <EndTimeDisplay
              endTime={data.endTime ?? null}
              size="large"
              appearance="brandWhite"
            />
          </div>

          {/* Row 1: Scatterplot (left) | Current Forecast + Prediction (right) - same height */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6 items-stretch">
            {/* Scatterplot - height matches the PredictionForm dynamically */}
            <div className="w-full min-h-[350px] bg-brand-black border border-border rounded-lg pt-4 pr-4 pb-2 pl-2">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 10, right: 10, bottom: 5, left: -10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--brand-white) / 0.1)"
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="X"
                    tick={{
                      fill: 'hsl(var(--brand-white))',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                    axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Y"
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{
                      fill: 'hsl(var(--brand-white))',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                    axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--brand-black))',
                      border: '1px solid hsl(var(--brand-white) / 0.2)',
                      borderRadius: '4px',
                      color: 'hsl(var(--brand-white))',
                    }}
                    labelStyle={{ color: 'hsl(var(--brand-white))' }}
                  />
                  <Scatter
                    name="Data"
                    data={placeholderData}
                    fill="hsl(var(--brand-white))"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Current Forecast + Prediction Form - same height as scatter plot */}
            <PredictionForm
              conditionId={conditionId}
              chainId={chainId}
              collateralToken={collateralToken}
              collateralSymbol={collateralSymbol}
              collateralDecimals={collateralDecimals}
              minWager={minWager}
              predictionMarketAddress={predictionMarketAddress}
              bids={bids}
              requestQuotes={requestQuotes}
              buildMintRequestDataFromBid={buildMintRequestDataFromBid}
              submitParlay={submitParlay}
              isSubmitting={isParlaySubmitting}
            />
          </div>

          {/* Row 2: Transactions/Forecasts Tabs (left) | Resolution/Contracts Tabs (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-12">
            {/* Transactions/Forecasts Tabs */}
            <Tabs defaultValue="transactions" className="w-full">
              <TabsList className="w-full justify-start bg-brand-black border border-border rounded-lg h-auto p-1">
                <TabsTrigger
                  value="transactions"
                  className="data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground"
                >
                  Transactions
                </TabsTrigger>
                <TabsTrigger
                  value="forecasts"
                  className="data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground"
                >
                  Forecasts
                </TabsTrigger>
              </TabsList>
              <TabsContent value="transactions" className="mt-4">
                <div className="border border-border rounded-lg bg-brand-black p-4">
                  <span className="text-muted-foreground text-sm">
                    Coming soon
                  </span>
                </div>
              </TabsContent>
              <TabsContent value="forecasts" className="mt-4">
                <div className="border border-border rounded-lg bg-brand-black overflow-hidden">
                  <div className="p-4">
                    <ConditionForecastForm
                      conditionId={conditionId}
                      question={data.shortName || data.question || ''}
                      endTime={data.endTime ?? undefined}
                      categorySlug={data.category?.slug}
                      onSuccess={handleForecastSuccess}
                    />
                  </div>
                  <Comments
                    selectedCategory={CommentFilters.SelectedQuestion}
                    question={data.shortName || data.question}
                    refetchTrigger={refetchTrigger}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Resolution Criteria / Smart Contracts Tabs */}
            <Tabs defaultValue="resolution" className="w-full">
              <TabsList className="w-full justify-start bg-brand-black border border-border rounded-lg h-auto p-1">
                <TabsTrigger
                  value="resolution"
                  className="data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground text-xs"
                >
                  Resolution Criteria
                </TabsTrigger>
                <TabsTrigger
                  value="contracts"
                  className="data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground text-xs"
                >
                  Smart Contracts
                </TabsTrigger>
              </TabsList>
              <TabsContent value="resolution" className="mt-4">
                <div className="border border-border rounded-lg bg-brand-black p-4">
                  {data.description ? (
                    <>
                      <div className="relative overflow-hidden">
                        <motion.div
                          initial={false}
                          animate={{
                            height: isDescriptionExpanded ? 'auto' : '4.5em',
                          }}
                          transition={{ duration: 0.3, ease: 'easeInOut' }}
                          className="text-sm leading-relaxed break-words [&_a]:break-all text-brand-white/90"
                        >
                          <SafeMarkdown
                            content={data.description}
                            className="break-words [&_a]:break-all prose prose-invert prose-sm max-w-none"
                          />
                        </motion.div>
                        <AnimatePresence>
                          {!isDescriptionExpanded && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-brand-black to-transparent pointer-events-none"
                            />
                          )}
                        </AnimatePresence>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setIsDescriptionExpanded(!isDescriptionExpanded)
                        }
                        className="mt-2 text-sm font-medium gold-link"
                      >
                        {isDescriptionExpanded ? 'Show less' : 'Read more'}
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      No resolution criteria available.
                    </span>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="contracts" className="mt-4">
                <div className="border border-border rounded-lg bg-brand-black overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground font-medium whitespace-nowrap">
                          Market
                        </td>
                        <td className="px-3 py-2.5 text-brand-white font-mono text-[10px] break-all">
                          {(() => {
                            const chainId = data.chainId ?? 42161;
                            const address = predictionMarket[chainId]?.address;
                            if (!address) return '—';
                            return (
                              <a
                                href={`https://arbiscan.io/address/${address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:text-accent-gold transition-colors"
                              >
                                {`${address.slice(0, 6)}...${address.slice(-4)}`}
                                <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                              </a>
                            );
                          })()}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground font-medium whitespace-nowrap">
                          Resolver
                        </td>
                        <td className="px-3 py-2.5 text-brand-white font-mono text-[10px] break-all">
                          {(() => {
                            const chainId = data.chainId ?? 42161;
                            const address = umaResolver[chainId]?.address;
                            if (!address) return '—';
                            return (
                              <a
                                href={`https://arbiscan.io/address/${address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:text-accent-gold transition-colors"
                              >
                                {`${address.slice(0, 6)}...${address.slice(-4)}`}
                                <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                              </a>
                            );
                          })()}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground font-medium whitespace-nowrap">
                          Condition
                        </td>
                        <td className="px-3 py-2.5 text-brand-white font-mono text-[10px] break-all">
                          {`${conditionId.slice(0, 6)}...${conditionId.slice(-4)}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
