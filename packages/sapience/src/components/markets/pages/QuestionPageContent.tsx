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
import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/sdk/ui/components/ui/table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, DollarSign, ExternalLink } from 'lucide-react';
import {
  predictionMarket,
  umaResolver,
} from '@sapience/sdk/contracts/addresses';
import { motion, AnimatePresence } from 'framer-motion';
import { erc20Abi, formatUnits } from 'viem';
import { useReadContracts } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import SafeMarkdown from '~/components/shared/SafeMarkdown';
import PredictionForm from './PredictionForm';
import Comments, { CommentFilters } from '~/components/shared/Comments';
import ConditionForecastForm from '~/components/conditions/ConditionForecastForm';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import { useSubmitParlay } from '~/hooks/forms/useSubmitParlay';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';

// Placeholder data for the scatter plot and predictions table
const placeholderPredictions = [
  {
    x: Date.now() - 7 * 24 * 60 * 60 * 1000,
    y: 30,
    wager: 50,
    maker: '0x1234567890abcdef1234567890abcdef12345678',
    taker: '0xabcdef0123456789abcdef0123456789abcdef01',
    time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 6 * 24 * 60 * 60 * 1000,
    y: 50,
    wager: 120,
    maker: '0xabcdef0123456789abcdef0123456789abcdef01',
    taker: '0x234567890abcdef1234567890abcdef123456789',
    time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 5 * 24 * 60 * 60 * 1000,
    y: 35,
    wager: 25,
    maker: '0x234567890abcdef1234567890abcdef123456789',
    taker: '0xbcdef0123456789abcdef0123456789abcdef012',
    time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 4 * 24 * 60 * 60 * 1000,
    y: 70,
    wager: 200,
    maker: '0xbcdef0123456789abcdef0123456789abcdef012',
    taker: '0x3456789abcdef0123456789abcdef0123456789a',
    time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 3 * 24 * 60 * 60 * 1000,
    y: 45,
    wager: 75,
    maker: '0x3456789abcdef0123456789abcdef0123456789a',
    taker: '0xcdef0123456789abcdef0123456789abcdef0123',
    time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 2 * 24 * 60 * 60 * 1000,
    y: 60,
    wager: 150,
    maker: '0xcdef0123456789abcdef0123456789abcdef0123',
    taker: '0x456789abcdef0123456789abcdef0123456789ab',
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 1 * 24 * 60 * 60 * 1000,
    y: 55,
    wager: 40,
    maker: '0x456789abcdef0123456789abcdef0123456789ab',
    taker: '0xdef0123456789abcdef0123456789abcdef01234',
    time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 12 * 60 * 60 * 1000,
    y: 80,
    wager: 300,
    maker: '0xdef0123456789abcdef0123456789abcdef01234',
    taker: '0x56789abcdef0123456789abcdef0123456789abc',
    time: new Date(Date.now() - 12 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 6 * 60 * 60 * 1000,
    y: 65,
    wager: 90,
    maker: '0x56789abcdef0123456789abcdef0123456789abc',
    taker: '0xef0123456789abcdef0123456789abcdef012345',
    time: new Date(Date.now() - 6 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 1 * 60 * 60 * 1000,
    y: 75,
    wager: 175,
    maker: '0xef0123456789abcdef0123456789abcdef012345',
    taker: '0x1234567890abcdef1234567890abcdef12345678',
    time: new Date(Date.now() - 1 * 60 * 60 * 1000).toLocaleString(),
  },
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

  // Fetch predictions (forecasts) for this condition
  const { data: predictions } = useForecasts({
    conditionId,
    options: {
      enabled: Boolean(conditionId),
    },
  });

  // Type for prediction data used in scatter plot and table
  type PredictionData = {
    x: number;
    y: number;
    wager: number;
    maker: string;
    taker: string;
    time: string;
  };

  // Transform predictions data for scatter plot
  // x = time (unix timestamp), y = prediction probability (0-100), wager = amount wagered
  const scatterData = useMemo((): PredictionData[] => {
    // If no real predictions, use placeholder data
    if (!predictions || predictions.length === 0) {
      return placeholderPredictions;
    }

    // Pre-calculate YES price for percentage conversion
    const YES_SQRT_X96_PRICE_D18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);

    const realData = predictions
      .map((p) => {
        // Convert sqrtPriceX96 to percentage (0-100)
        // The value is stored as a BigInt string representation of sqrtPriceX96
        try {
          const predictionBigInt = BigInt(p.value);
          const priceD18 = sqrtPriceX96ToPriceD18(predictionBigInt);
          const percentageD2 =
            (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
          const predictionPercent = Math.round(Number(percentageD2) / 100);

          if (
            !Number.isFinite(predictionPercent) ||
            predictionPercent < 0 ||
            predictionPercent > 100
          )
            return null;

          return {
            x: p.rawTime * 1000, // Convert to milliseconds for Date
            y: predictionPercent,
            wager: 100, // Default wager for real data (TODO: get from actual data when available)
            maker: p.attester,
            taker: p.attester, // Use attester for both for now until we have real trade data
            time: p.time,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as PredictionData[];

    // If all real data failed to parse, fall back to placeholder
    return realData.length > 0 ? realData : placeholderPredictions;
  }, [predictions]);

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

  // Column definitions for predictions table
  const predictionsColumns: ColumnDef<PredictionData>[] = useMemo(
    () => [
      {
        accessorKey: 'x',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(sorted === 'asc')}
              className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            >
              Time
              {sorted === 'asc' ? (
                <ChevronUp className="h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <span className="flex flex-col -my-2">
                  <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </span>
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const time = row.original.time;
          return (
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {time}
            </span>
          );
        },
        sortingFn: (rowA, rowB) => rowA.original.x - rowB.original.x,
      },
      {
        accessorKey: 'wager',
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(sorted === 'asc')}
              className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            >
              Total Wager
              {sorted === 'asc' ? (
                <ChevronUp className="h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <span className="flex flex-col -my-2">
                  <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </span>
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <span className="font-mono text-brand-white whitespace-nowrap">
            {row.original.wager} USDe
          </span>
        ),
        sortingFn: (rowA, rowB) => rowA.original.wager - rowB.original.wager,
      },
      {
        id: 'impliedForecast',
        header: () => (
          <span className="text-sm font-medium whitespace-nowrap">
            Implied Forecast
          </span>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-ethena whitespace-nowrap">
            {row.original.y}% chance
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'participants',
        header: () => (
          <span className="text-sm font-medium whitespace-nowrap">
            Participants
          </span>
        ),
        cell: ({ row }) => {
          const { maker, taker } = row.original;
          return (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <div className="flex items-center gap-1">
                <EnsAvatar address={maker} width={16} height={16} />
                <AddressDisplay
                  address={maker}
                  compact
                  disableProfileLink
                  disablePopover
                  hideVaultIcon
                />
              </div>
              <span className="text-muted-foreground text-xs">vs.</span>
              <div className="flex items-center gap-1">
                <EnsAvatar address={taker} width={16} height={16} />
                <AddressDisplay
                  address={taker}
                  compact
                  disableProfileLink
                  disablePopover
                  hideVaultIcon
                />
              </div>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'combinedPrediction',
        header: () => (
          <span className="text-sm font-medium whitespace-nowrap">
            Combined Prediction
          </span>
        ),
        cell: () => <span className="text-muted-foreground">None</span>,
        enableSorting: false,
      },
    ],
    []
  );

  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'x', desc: true },
  ]);

  const predictionsTable = useReactTable({
    data: scatterData,
    columns: predictionsColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
            <div className="w-full min-h-[350px] bg-brand-black border border-border rounded-lg pt-6 pr-8 pb-2 pl-2">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 24, bottom: 5, left: -10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--brand-white) / 0.1)"
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Time"
                    domain={xDomain}
                    ticks={xTicks}
                    tickFormatter={(value) => {
                      // Find the closest tick label
                      const closest = xTicks.reduce((prev, curr) =>
                        Math.abs(curr - value) < Math.abs(prev - value)
                          ? curr
                          : prev
                      );
                      return xTickLabels[closest] || '';
                    }}
                    tick={{
                      fill: 'hsl(var(--muted-foreground))',
                      fontSize: 11,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                    }}
                    axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Probability"
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{
                      fill: 'hsl(var(--muted-foreground))',
                      fontSize: 11,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                    }}
                    axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                  />
                  <Tooltip
                    cursor={false}
                    animationDuration={150}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload[0]) return null;
                      const point = payload[0]
                        .payload as (typeof scatterData)[0];
                      return (
                        <div
                          className="px-3 py-2 rounded border scatter-tooltip"
                          style={{
                            backgroundColor: 'hsl(var(--brand-black))',
                            border: '1px solid hsl(var(--brand-white) / 0.2)',
                          }}
                        >
                          <div className="text-sm font-medium text-brand-white">
                            {point.y}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Wager: {point.wager} USDe
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {point.maker.slice(0, 6)}...{point.maker.slice(-4)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {point.time}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    name="Predictions"
                    data={scatterData}
                    fill="hsl(var(--ethena))"
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      // Scale wager to radius: min 4px, max 20px
                      // Assuming wagers range from ~25 to ~300
                      const minR = 4;
                      const maxR = 20;
                      const minWager = 25;
                      const maxWager = 300;
                      const wager = payload?.wager || 100;
                      const normalizedWager = Math.max(
                        minWager,
                        Math.min(maxWager, wager)
                      );
                      const radius =
                        minR +
                        ((normalizedWager - minWager) / (maxWager - minWager)) *
                          (maxR - minR);
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={radius}
                          fill="hsl(var(--ethena) / 0.2)"
                          stroke="hsl(var(--ethena) / 0.8)"
                          strokeWidth={1.5}
                          className="scatter-dot"
                        />
                      );
                    }}
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

          {/* Row 2: Predictions/Forecasts (left) | Resolution/Contracts (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-12">
            {/* Predictions/Forecasts - Unified container with integrated tabs */}
            <Tabs defaultValue="predictions" className="w-full">
              <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black">
                {/* Header with integrated tabs */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/60 bg-muted/10">
                  <TabsList className="h-auto p-0 bg-transparent gap-1">
                    <TabsTrigger
                      value="predictions"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors"
                    >
                      Predictions
                    </TabsTrigger>
                    <TabsTrigger
                      value="forecasts"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors"
                    >
                      Forecasts
                    </TabsTrigger>
                  </TabsList>
                </div>
                {/* Content area */}
                <TabsContent value="predictions" className="m-0">
                  {scatterData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          {predictionsTable
                            .getHeaderGroups()
                            .map((headerGroup) => (
                              <TableRow
                                key={headerGroup.id}
                                className="hover:!bg-background bg-background border-b border-border/60"
                              >
                                {headerGroup.headers.map((header) => (
                                  <TableHead
                                    key={header.id}
                                    className="px-4 py-3 text-left text-sm font-medium text-muted-foreground"
                                  >
                                    {header.isPlaceholder
                                      ? null
                                      : flexRender(
                                          header.column.columnDef.header,
                                          header.getContext()
                                        )}
                                  </TableHead>
                                ))}
                              </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody className="bg-brand-black">
                          {predictionsTable.getRowModel().rows.length ? (
                            predictionsTable.getRowModel().rows.map((row) => (
                              <TableRow
                                key={row.id}
                                className="border-b border-border/60 hover:bg-brand-white/5 transition-colors"
                              >
                                {row.getVisibleCells().map((cell) => (
                                  <TableCell
                                    key={cell.id}
                                    className="px-4 py-3"
                                  >
                                    {flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext()
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell
                                colSpan={predictionsColumns.length}
                                className="h-24 text-center text-muted-foreground"
                              >
                                No predictions yet
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <span className="text-muted-foreground text-sm">
                        No predictions yet
                      </span>
                    </div>
                  )}
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
                    refetchTrigger={refetchTrigger}
                  />
                </TabsContent>
              </div>
            </Tabs>

            {/* Resolution Criteria / Smart Contracts - Unified container with integrated tabs */}
            <Tabs defaultValue="resolution" className="w-full">
              <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black">
                {/* Header with integrated tabs */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/60 bg-muted/10">
                  <TabsList className="h-auto p-0 bg-transparent gap-1">
                    <TabsTrigger
                      value="resolution"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors"
                    >
                      Resolution
                    </TabsTrigger>
                    <TabsTrigger
                      value="contracts"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors"
                    >
                      Contracts
                    </TabsTrigger>
                  </TabsList>
                </div>
                {/* Content area */}
                <TabsContent value="resolution" className="m-0 p-4">
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
                </TabsContent>
                <TabsContent value="contracts" className="m-0">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border/60">
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
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .scatter-dot {
          transition: fill 150ms ease-out;
          cursor: pointer;
        }
        .scatter-dot:hover {
          animation: scatter-pulse 2.5s ease-in-out infinite;
        }
        @keyframes scatter-pulse {
          0%,
          100% {
            fill: hsl(var(--ethena) / 0.2);
          }
          50% {
            fill: hsl(var(--ethena) / 0.45);
          }
        }
        .scatter-tooltip {
          animation: tooltip-fade-in 150ms ease-out;
        }
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
