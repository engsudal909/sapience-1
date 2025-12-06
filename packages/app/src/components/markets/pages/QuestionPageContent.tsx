'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import dynamic from 'next/dynamic';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';
import {
  ArrowLeftRight,
  Bot,
  Code,
  DollarSign,
  Handshake,
  Telescope,
} from 'lucide-react';
import {
  predictionMarket,
  umaResolver,
  lzPMResolver,
  lzUmaResolver,
} from '@sapience/sdk/contracts/addresses';
import { erc20Abi, formatUnits } from 'viem';
import { useReadContracts } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
import SafeMarkdown from '~/components/shared/SafeMarkdown';
import { ResolverBadge } from '~/components/shared/ResolverBadge';
import PredictionForm from './PredictionForm';
import Comments, { CommentFilters } from '~/components/shared/Comments';
import ConditionForecastForm from '~/components/conditions/ConditionForecastForm';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import ResearchAgent from '~/components/markets/ResearchAgent';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import { useSubmitPosition } from '~/hooks/forms/useSubmitPosition';
import { usePositionsByConditionId } from '~/hooks/graphql/usePositionsByConditionId';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { formatEther } from 'viem';
import {
  type PredictionData,
  type ForecastData,
  type CombinedPrediction,
  PredictionScatterChart,
  PredictionsTable,
  TechSpecTable,
  scatterChartStyles,
} from '~/components/markets/question';

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
      openInterest?: string | null;
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
            openInterest
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
          openInterest?: string | null;
        }>;
      }>(QUERY, { ids: [conditionId] });
      return resp?.conditions?.[0] || null;
    },
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const handleForecastSuccess = React.useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  // Determine chain ID from condition data or default
  const chainId = data?.chainId ?? DEFAULT_CHAIN_ID;

  // Get resolver address for this chain
  const resolverAddress =
    lzPMResolver[chainId]?.address ??
    lzUmaResolver[chainId]?.address ??
    umaResolver[chainId]?.address;

  // Get PredictionMarket address for this chain
  const predictionMarketAddress = predictionMarket[chainId]?.address;

  // Initiate auction start hook for RFQ quote management
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

  // Initialize submit position hook for mint transaction
  const { submitPosition, isSubmitting: isPositionSubmitting } =
    useSubmitPosition({
      chainId,
      predictionMarketAddress: predictionMarketAddress,
      collateralTokenAddress: collateralToken as `0x${string}`,
      enabled: !!predictionMarketAddress && !!collateralToken,
    });

  // Fetch positions for this condition
  const { data: positions, isLoading: isLoadingPositions } =
    usePositionsByConditionId({
      conditionId,
      chainId,
      options: {
        enabled: Boolean(conditionId),
      },
    });

  // Fetch forecasts for this condition
  const { data: forecasts } = useForecasts({
    conditionId,
    options: {
      enabled: Boolean(conditionId),
    },
  });

  // Debug: Log forecasts data
  React.useEffect(() => {
    if (forecasts) {
      console.log('[QuestionPageContent] Forecasts fetched:', {
        count: forecasts.length,
        conditionId,
        forecasts: forecasts.map((f) => ({
          id: f.id,
          attester: f.attester,
          value: f.value,
          rawTime: f.rawTime,
          comment: f.comment,
          questionId: f.questionId,
        })),
      });
    }
  }, [forecasts, conditionId]);

  // Transform parlay data for scatter plot
  // x = time (unix timestamp), y = prediction probability (0-100), wager = amount wagered
  const scatterData = useMemo((): PredictionData[] => {
    // If no real positions, return empty array
    if (!positions || positions.length === 0) {
      return [];
    }

    const realData = positions
      .map((parlay) => {
        try {
          // Find the prediction for the current conditionId in this parlay
          const currentConditionOutcome = parlay.predictedOutcomes.find(
            (outcome) =>
              outcome.conditionId.toLowerCase() === conditionId.toLowerCase()
          );

          if (!currentConditionOutcome) {
            return null;
          }

          // Get other conditions in the parlay (for combined predictions)
          const otherOutcomes = parlay.predictedOutcomes.filter(
            (outcome) =>
              outcome.conditionId.toLowerCase() !== conditionId.toLowerCase()
          );

          // Calculate individual collateral amounts
          let makerCollateral = 0;
          let takerCollateral = 0;
          try {
            makerCollateral = parlay.makerCollateral
              ? parseFloat(formatEther(BigInt(parlay.makerCollateral)))
              : 0;
            takerCollateral = parlay.takerCollateral
              ? parseFloat(formatEther(BigInt(parlay.takerCollateral)))
              : 0;
          } catch {
            // Fallback: try to derive from totalCollateral if individual amounts not available
            try {
              const totalCollateralWei = BigInt(parlay.totalCollateral || '0');
              const totalCollateral = parseFloat(
                formatEther(totalCollateralWei)
              );
              // If individual amounts not available, split evenly (fallback)
              makerCollateral = totalCollateral / 2;
              takerCollateral = totalCollateral / 2;
            } catch {
              makerCollateral = 0;
              takerCollateral = 0;
            }
          }

          // Calculate total wager (for sizing)
          const wager = makerCollateral + takerCollateral;

          // predictedOutcomes represents the taker's predictions
          // So if taker predicts YES (prediction = true), maker predicts NO (opposite)
          // If taker predicts NO (prediction = false), maker predicts YES (opposite)
          const takerPrediction = currentConditionOutcome.prediction;
          const makerPrediction = !takerPrediction; // Maker has opposite prediction

          // Build combined predictions array if there are other conditions
          const combinedPredictions: CombinedPrediction[] | undefined =
            otherOutcomes.length > 0
              ? otherOutcomes.map((outcome) => ({
                  question:
                    outcome.condition?.shortName ||
                    outcome.condition?.question ||
                    outcome.conditionId,
                  prediction: outcome.prediction,
                  categorySlug: outcome.condition?.category?.slug,
                }))
              : undefined;

          // Convert mintedAt (seconds) to milliseconds
          const timestamp = parlay.mintedAt * 1000;
          const date = new Date(timestamp);

          // Calculate implied probability of YES from wager amounts
          // Always compute based on taker's bet:
          // - If taker bets YES: probability of YES = takerCollateral / totalWager
          // - If taker bets NO: probability of YES = makerCollateral / totalWager (maker bets YES)
          let predictionPercent = 50; // Default fallback
          const totalWager = makerCollateral + takerCollateral;
          if (totalWager > 0) {
            if (takerPrediction) {
              // Taker bets YES: probability of YES = takerCollateral / totalWager
              predictionPercent = (takerCollateral / totalWager) * 100;
            } else {
              // Taker bets NO: probability of YES = makerCollateral / totalWager (maker bets YES)
              predictionPercent = (makerCollateral / totalWager) * 100;
            }
            // Clamp to 0-100 range
            predictionPercent = Math.max(0, Math.min(100, predictionPercent));
          }

          return {
            x: timestamp,
            y: predictionPercent,
            wager,
            maker: parlay.maker,
            taker: parlay.taker,
            makerPrediction,
            makerCollateral,
            takerCollateral,
            time: date.toLocaleString(),
            combinedPredictions,
            combinedWithYes: takerPrediction, // Combined predictions are tied to taker's prediction
          };
        } catch (error) {
          console.error('Error processing parlay:', error);
          return null;
        }
      })
      .filter(Boolean) as PredictionData[];

    return realData;
  }, [positions, conditionId]);

  // Calculate wager range from actual data for dynamic sizing
  const wagerRange = useMemo(() => {
    if (scatterData.length === 0) {
      return { wagerMin: 0, wagerMax: 100 };
    }
    const wagers = scatterData.map((d) => d.wager).filter((w) => w > 0);
    if (wagers.length === 0) {
      return { wagerMin: 0, wagerMax: 100 };
    }
    const wagerMin = Math.min(...wagers);
    const wagerMax = Math.max(...wagers);
    // If all wagers are the same, add a small range to avoid division by zero
    if (wagerMin === wagerMax) {
      return { wagerMin: Math.max(0, wagerMin - 1), wagerMax: wagerMax + 1 };
    }
    return { wagerMin, wagerMax };
  }, [scatterData]);

  // Transform forecasts data for scatter plot
  // Forecasts are user-submitted probability predictions (not positions)
  const forecastScatterData = useMemo(() => {
    if (!forecasts || forecasts.length === 0) {
      return [];
    }

    console.log('[QuestionPageContent] Transforming forecasts:', {
      count: forecasts.length,
      rawForecasts: forecasts,
    });

    const transformed = forecasts
      .map(
        (forecast: {
          value: string;
          rawTime: number;
          attester: string;
          comment?: string;
        }) => {
          try {
            // Parse prediction value (stored as sqrtPriceX96 bigint string)
            // Convert from sqrtPriceX96 to percentage (0-100)
            let predictionPercent = 50; // Default fallback
            const predictionValue = forecast.value;
            if (predictionValue) {
              try {
                // Convert sqrtPriceX96 to percentage
                const prediction = BigInt(predictionValue);
                const priceD18 = sqrtPriceX96ToPriceD18(prediction);
                const YES_SQRT_X96_PRICE_D18 =
                  sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
                const percentageD2 =
                  (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
                predictionPercent = Math.round(Number(percentageD2) / 100);
                // Clamp to 0-100 range
                predictionPercent = Math.max(
                  0,
                  Math.min(100, predictionPercent)
                );
              } catch (error) {
                console.warn(
                  '[QuestionPageContent] Error converting sqrtPriceX96 to percentage:',
                  {
                    value: predictionValue,
                    error,
                    forecast,
                  }
                );
              }
            }

            // Convert time (Unix timestamp in seconds) to milliseconds
            const timestamp = forecast.rawTime * 1000;
            const date = new Date(timestamp);

            const result = {
              x: timestamp,
              y: predictionPercent,
              time: date.toLocaleString(),
              attester: forecast.attester,
              comment: forecast.comment || '',
            };

            console.log('[QuestionPageContent] Transformed forecast:', {
              original: forecast,
              transformed: result,
            });

            return result;
          } catch (error) {
            console.error(
              '[QuestionPageContent] Error processing forecast:',
              error,
              forecast
            );
            return null;
          }
        }
      )
      .filter(Boolean) as ForecastData[];

    console.log('[QuestionPageContent] Final forecastScatterData:', {
      count: transformed.length,
      data: transformed,
    });

    return transformed;
  }, [forecasts]);

  // Computed flags for conditional rendering
  const hasPositions = scatterData.length > 0;
  const hasForecasts = forecastScatterData.length > 0;
  const shouldShowChart = hasPositions || hasForecasts;

  // Calculate X axis domain and ticks based on predictions data
  const { xDomain, xTicks, xTickLabels } = useMemo(() => {
    if (scatterData.length === 0) {
      // Default to last 7 days if no data
      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      return {
        xDomain: [weekAgo, now] as [number, number],
        xTicks: [weekAgo, now - 3.5 * 24 * 60 * 60 * 1000, now],
        xTickLabels: {} as Record<number, string>,
      };
    }

    const times = scatterData.map((d) => d.x);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    // Add some padding (10% on each side)
    const range = maxTime - minTime || 24 * 60 * 60 * 1000; // Default to 1 day if single point
    const padding = range * 0.1;
    const domain: [number, number] = [minTime - padding, maxTime + padding];

    // Create evenly spaced ticks
    const tickCount = 5;
    const ticks: number[] = [];
    const labels: Record<number, string> = {};
    for (let i = 0; i < tickCount; i++) {
      const tick = domain[0] + (i * (domain[1] - domain[0])) / (tickCount - 1);
      ticks.push(tick);
      const date = new Date(tick);
      labels[tick] = `${date.getMonth() + 1}/${date.getDate()}`;
    }

    return { xDomain: domain, xTicks: ticks, xTickLabels: labels };
  }, [scatterData]);

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
                <span className="text-brand-white">{categoryStyle.name}</span>
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
                  <DollarSign className="h-4 w-4 mr-1.5 -mt-[1px] opacity-70" />
                  {isPastEndTime ? 'Peak Open Interest' : 'Open Interest'}
                  <span
                    aria-hidden="true"
                    className="hidden md:inline-block mx-2.5 h-4 w-px bg-muted-foreground/30"
                  />
                  <span className="whitespace-nowrap text-foreground font-normal">
                    {(() => {
                      // Get open interest from data and format it
                      const openInterestWei = data?.openInterest || '0';
                      try {
                        const etherValue = parseFloat(
                          formatEther(BigInt(openInterestWei))
                        );
                        const formattedValue = etherValue.toFixed(2);
                        return `${formattedValue} USDe`;
                      } catch {
                        return '0 USDe';
                      }
                    })()}
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

            {/* Resolver Badge */}
            <ResolverBadge
              resolverAddress={resolverAddress}
              size="large"
              appearance="brandWhite"
            />
          </div>

          {/* Row 1: Scatterplot (left) | Current Forecast + Prediction (right) - same height */}
          {/* Only render this row when there's chart data to show */}
          {shouldShowChart && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6 items-stretch">
              {/* Scatterplot - height matches the PredictionForm dynamically */}
              <div className="relative w-full min-w-0 min-h-[350px] bg-brand-black border border-border rounded-lg pt-6 pr-8 pb-2 pl-2">
                <PredictionScatterChart
                  scatterData={scatterData}
                  forecastScatterData={forecastScatterData}
                  isLoading={isLoadingPositions}
                  wagerRange={wagerRange}
                  xDomain={xDomain}
                  xTicks={xTicks}
                  xTickLabels={xTickLabels}
                />
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
                submitPosition={submitPosition}
                isSubmitting={isPositionSubmitting}
              />
            </div>
          )}

          {/* Mobile: Show PredictionForm when no chart data */}
          {!shouldShowChart && (
            <div className="lg:hidden mb-6">
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
                submitPosition={submitPosition}
                isSubmitting={isPositionSubmitting}
              />
            </div>
          )}

          {/* Row 2: Mobile - All tabs in one container */}
          <div className="lg:hidden mb-12">
            <Tabs
              defaultValue={hasPositions ? 'predictions' : 'forecasts'}
              className="w-full min-w-0"
            >
              <div className="border border-border rounded-lg overflow-hidden bg-brand-black w-full min-w-0">
                {/* Header with all 5 tabs */}
                <div className="flex items-center gap-4 px-2 py-2.5 border-b border-border/60 bg-muted/10 overflow-x-auto">
                  <TabsList className="h-auto p-0 bg-transparent gap-2 flex-nowrap">
                    {hasPositions && (
                      <TabsTrigger
                        value="predictions"
                        className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        Positions
                      </TabsTrigger>
                    )}
                    <TabsTrigger
                      value="forecasts"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Telescope className="h-3.5 w-3.5" />
                      Forecasts
                    </TabsTrigger>
                    <TabsTrigger
                      value="resolution"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Handshake className="h-3.5 w-3.5" />
                      Resolution
                    </TabsTrigger>
                    <TabsTrigger
                      value="agent"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Bot className="h-3.5 w-3.5" />
                      Agent
                    </TabsTrigger>
                    <TabsTrigger
                      value="techspec"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Code className="h-3.5 w-3.5" />
                      Tech Spec
                    </TabsTrigger>
                  </TabsList>
                </div>
                {/* Content area - Positions */}
                <TabsContent value="predictions" className="m-0">
                  <PredictionsTable
                    data={scatterData}
                    isLoading={isLoadingPositions}
                  />
                </TabsContent>
                {/* Content area - Forecasts */}
                <TabsContent value="forecasts" className="m-0">
                  <div className="p-4 border-b border-border/60">
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
                    conditionId={conditionId}
                    refetchTrigger={refetchTrigger}
                  />
                </TabsContent>
                {/* Content area - Resolution */}
                <TabsContent value="resolution" className="m-0 p-4">
                  <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <EndTimeDisplay
                      endTime={data.endTime ?? null}
                      size="normal"
                      appearance="brandWhite"
                    />
                    <ResolverBadge
                      resolverAddress={resolverAddress}
                      size="normal"
                      appearance="brandWhite"
                    />
                  </div>
                  {data.description ? (
                    <div className="text-sm leading-relaxed break-words [&_a]:break-all text-brand-white/90">
                      <SafeMarkdown
                        content={data.description}
                        className="break-words [&_a]:break-all prose prose-invert prose-sm max-w-none"
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      No resolution criteria available.
                    </span>
                  )}
                </TabsContent>
                {/* Content area - Agent */}
                <TabsContent value="agent" className="m-0">
                  <ResearchAgent
                    question={data.shortName || data.question}
                    endTime={data.endTime}
                    description={data.description}
                  />
                </TabsContent>
                {/* Content area - Tech Spec */}
                <TabsContent value="techspec" className="m-0">
                  <TechSpecTable
                    conditionId={conditionId}
                    chainId={data.chainId ?? 42161}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Row 2: Desktop - Predictions/Forecasts (left) | Agent/Tech Spec (right) */}
          {/* Only show this layout when chart is visible (has positions or forecasts) */}
          {shouldShowChart && (
            <div className="hidden lg:grid lg:grid-cols-[1fr_320px] gap-6 mb-12">
              {/* Predictions/Forecasts/Resolution - Unified container with integrated tabs */}
              <Tabs
                defaultValue={hasPositions ? 'predictions' : 'forecasts'}
                className="w-full min-w-0"
              >
                <div className="border border-border rounded-lg overflow-hidden bg-brand-black w-full min-w-0">
                  {/* Header with integrated tabs */}
                  <div className="flex items-center gap-4 px-2 py-2.5 border-b border-border/60 bg-muted/10">
                    <TabsList className="h-auto p-0 bg-transparent gap-2">
                      {hasPositions && (
                        <TabsTrigger
                          value="predictions"
                          className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          Positions
                        </TabsTrigger>
                      )}
                      <TabsTrigger
                        value="forecasts"
                        className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                      >
                        <Telescope className="h-3.5 w-3.5" />
                        Forecasts
                      </TabsTrigger>
                      <TabsTrigger
                        value="resolution"
                        className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                      >
                        <Handshake className="h-3.5 w-3.5" />
                        Resolution
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  {/* Content area */}
                  <TabsContent value="predictions" className="m-0">
                    <PredictionsTable
                      data={scatterData}
                      isLoading={isLoadingPositions}
                    />
                  </TabsContent>
                  <TabsContent value="forecasts" className="m-0">
                    <div className="p-4 border-b border-border/60">
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
                      conditionId={conditionId}
                      refetchTrigger={refetchTrigger}
                    />
                  </TabsContent>
                  <TabsContent value="resolution" className="m-0 p-4">
                    <div className="mb-4 flex items-center gap-3 flex-wrap">
                      <EndTimeDisplay
                        endTime={data.endTime ?? null}
                        size="normal"
                        appearance="brandWhite"
                      />
                      <ResolverBadge
                        resolverAddress={resolverAddress}
                        size="normal"
                        appearance="brandWhite"
                      />
                    </div>
                    {data.description ? (
                      <div className="text-sm leading-relaxed break-words [&_a]:break-all text-brand-white/90">
                        <SafeMarkdown
                          content={data.description}
                          className="break-words [&_a]:break-all prose prose-invert prose-sm max-w-none"
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        No resolution criteria available.
                      </span>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              {/* Agent / Tech Spec - Unified container with integrated tabs */}
              <Tabs defaultValue="agent" className="w-full">
                <div className="border border-border rounded-lg overflow-hidden bg-brand-black">
                  {/* Header with integrated tabs */}
                  <div className="flex items-center gap-4 px-2 py-2.5 border-b border-border/60 bg-muted/10">
                    <TabsList className="h-auto p-0 bg-transparent gap-2">
                      <TabsTrigger
                        value="agent"
                        className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                      >
                        <Bot className="h-3.5 w-3.5" />
                        Agent
                      </TabsTrigger>
                      <TabsTrigger
                        value="techspec"
                        className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                      >
                        <Code className="h-3.5 w-3.5" />
                        Tech Spec
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  {/* Content area */}
                  <TabsContent value="agent" className="m-0">
                    <ResearchAgent
                      question={data.shortName || data.question}
                      endTime={data.endTime}
                      description={data.description}
                    />
                  </TabsContent>
                  <TabsContent value="techspec" className="m-0">
                    <TechSpecTable
                      conditionId={conditionId}
                      chainId={data.chainId ?? 42161}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          )}

          {/* Alternative Desktop layout when no chart data - Forecasts/Resolution (left) | PredictionForm + Agent/TechSpec (right) */}
          {!shouldShowChart && (
            <div className="hidden lg:grid lg:grid-cols-[1fr_320px] gap-6 mb-12">
              {/* Forecasts/Resolution - Left column */}
              <Tabs defaultValue="forecasts" className="w-full min-w-0">
                <div className="border border-border rounded-lg overflow-hidden bg-brand-black w-full min-w-0">
                  {/* Header with integrated tabs */}
                  <div className="flex items-center gap-4 px-2 py-2.5 border-b border-border/60 bg-muted/10">
                    <TabsList className="h-auto p-0 bg-transparent gap-2">
                      <TabsTrigger
                        value="forecasts"
                        className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                      >
                        <Telescope className="h-3.5 w-3.5" />
                        Forecasts
                      </TabsTrigger>
                      <TabsTrigger
                        value="resolution"
                        className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                      >
                        <Handshake className="h-3.5 w-3.5" />
                        Resolution
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  {/* Content area */}
                  <TabsContent value="forecasts" className="m-0">
                    <div className="p-4 border-b border-border/60">
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
                      conditionId={conditionId}
                      refetchTrigger={refetchTrigger}
                    />
                  </TabsContent>
                  <TabsContent value="resolution" className="m-0 p-4">
                    <div className="mb-4 flex items-center gap-3 flex-wrap">
                      <EndTimeDisplay
                        endTime={data.endTime ?? null}
                        size="normal"
                        appearance="brandWhite"
                      />
                      <ResolverBadge
                        resolverAddress={resolverAddress}
                        size="normal"
                        appearance="brandWhite"
                      />
                    </div>
                    {data.description ? (
                      <div className="text-sm leading-relaxed break-words [&_a]:break-all text-brand-white/90">
                        <SafeMarkdown
                          content={data.description}
                          className="break-words [&_a]:break-all prose prose-invert prose-sm max-w-none"
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        No resolution criteria available.
                      </span>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              {/* Right column: PredictionForm + Agent/TechSpec stacked */}
              <div className="flex flex-col gap-6">
                {/* PredictionForm at top */}
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
                  submitPosition={submitPosition}
                  isSubmitting={isPositionSubmitting}
                />

                {/* Agent / Tech Spec tabs below */}
                <Tabs defaultValue="agent" className="w-full">
                  <div className="border border-border rounded-lg overflow-hidden bg-brand-black">
                    {/* Header with integrated tabs */}
                    <div className="flex items-center gap-4 px-2 py-2.5 border-b border-border/60 bg-muted/10">
                      <TabsList className="h-auto p-0 bg-transparent gap-2">
                        <TabsTrigger
                          value="agent"
                          className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                        >
                          <Bot className="h-3.5 w-3.5" />
                          Agent
                        </TabsTrigger>
                        <TabsTrigger
                          value="techspec"
                          className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.08] data-[state=active]:bg-brand-white/15 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.12] transition-colors inline-flex items-center gap-1.5"
                        >
                          <Code className="h-3.5 w-3.5" />
                          Tech Spec
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    {/* Content area */}
                    <TabsContent value="agent" className="m-0">
                      <ResearchAgent
                        question={data.shortName || data.question}
                        endTime={data.endTime}
                        description={data.description}
                      />
                    </TabsContent>
                    <TabsContent value="techspec" className="m-0">
                      <TechSpecTable
                        conditionId={conditionId}
                        chainId={data.chainId ?? 42161}
                      />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>
        {scatterChartStyles}
      </style>
    </div>
  );
}
