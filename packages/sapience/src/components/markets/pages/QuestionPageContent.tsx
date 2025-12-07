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
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/sdk/ui/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';
import { formatEther } from 'viem';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowLeftRight,
  ChevronUp,
  ChevronDown,
  Code,
  Copy,
  DollarSign,
  ExternalLink,
  Gavel,
  Telescope,
} from 'lucide-react';
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
import MarketBadge from '~/components/markets/MarketBadge';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import { useSubmitParlay } from '~/hooks/forms/useSubmitParlay';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { sqrtPriceX96ToPriceD18, formatFiveSigFigs } from '~/lib/utils/util';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';

// Placeholder data for the scatter plot and predictions table
const placeholderPredictions = [
  {
    x: Date.now() - 7 * 24 * 60 * 60 * 1000,
    y: 30,
    wager: 50,
    maker: '0x1234567890abcdef1234567890abcdef12345678',
    taker: '0xabcdef0123456789abcdef0123456789abcdef01',
    makerPrediction: true, // maker predicts YES, taker predicts NO
    time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 6 * 24 * 60 * 60 * 1000,
    y: 50,
    wager: 120,
    maker: '0xabcdef0123456789abcdef0123456789abcdef01',
    taker: '0x234567890abcdef1234567890abcdef123456789',
    makerPrediction: false, // maker predicts NO, taker predicts YES
    time: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 5 * 24 * 60 * 60 * 1000,
    y: 35,
    wager: 25,
    maker: '0x234567890abcdef1234567890abcdef123456789',
    taker: '0xbcdef0123456789abcdef0123456789abcdef012',
    makerPrediction: true,
    time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 4 * 24 * 60 * 60 * 1000,
    y: 70,
    wager: 200,
    maker: '0xbcdef0123456789abcdef0123456789abcdef012',
    taker: '0x3456789abcdef0123456789abcdef0123456789a',
    makerPrediction: true,
    time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toLocaleString(),
    combinedPredictions: [
      {
        question: 'Will BTC reach $100k by end of 2025?',
        prediction: true,
        categorySlug: 'crypto',
      },
      {
        question: 'Will ETH flip BTC market cap?',
        prediction: false,
        categorySlug: 'crypto',
      },
      {
        question: 'Will Solana reach $500?',
        prediction: true,
        categorySlug: 'crypto',
      },
    ],
    combinedWithYes: true, // the combined predictions are tied to the YES outcome
  },
  {
    x: Date.now() - 3 * 24 * 60 * 60 * 1000,
    y: 45,
    wager: 75,
    maker: '0x3456789abcdef0123456789abcdef0123456789a',
    taker: '0xcdef0123456789abcdef0123456789abcdef0123',
    makerPrediction: false,
    time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 2 * 24 * 60 * 60 * 1000,
    y: 60,
    wager: 150,
    maker: '0xcdef0123456789abcdef0123456789abcdef0123',
    taker: '0x456789abcdef0123456789abcdef0123456789ab',
    makerPrediction: true,
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 1 * 24 * 60 * 60 * 1000,
    y: 55,
    wager: 40,
    maker: '0x456789abcdef0123456789abcdef0123456789ab',
    taker: '0xdef0123456789abcdef0123456789abcdef01234',
    makerPrediction: false,
    time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 12 * 60 * 60 * 1000,
    y: 80,
    wager: 300,
    maker: '0xdef0123456789abcdef0123456789abcdef01234',
    taker: '0x56789abcdef0123456789abcdef0123456789abc',
    makerPrediction: true,
    time: new Date(Date.now() - 12 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 6 * 60 * 60 * 1000,
    y: 65,
    wager: 90,
    maker: '0x56789abcdef0123456789abcdef0123456789abc',
    taker: '0xef0123456789abcdef0123456789abcdef012345',
    makerPrediction: true,
    time: new Date(Date.now() - 6 * 60 * 60 * 1000).toLocaleString(),
  },
  {
    x: Date.now() - 1 * 60 * 60 * 1000,
    y: 75,
    wager: 175,
    maker: '0xef0123456789abcdef0123456789abcdef012345',
    taker: '0x1234567890abcdef1234567890abcdef12345678',
    makerPrediction: false,
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

// Type for combined prediction in a parlay
type CombinedPrediction = {
  question: string;
  prediction: boolean;
  categorySlug?: string;
};

// Type for prediction data used in scatter plot and table
type PredictionData = {
  x: number;
  y: number;
  wager: number;
  maker: string;
  taker: string;
  makerPrediction: boolean; // true = maker predicts YES, false = maker predicts NO
  time: string;
  combinedPredictions?: CombinedPrediction[];
  combinedWithYes?: boolean; // true = combined predictions are tied to YES outcome
  comment?: string; // Optional comment text from forecast
  attester?: string; // Forecaster's address
  predictionPercent?: number; // Prediction as percentage (0-100)
};

export default function QuestionPageContent({
  conditionId,
}: QuestionPageContentProps) {
  const [refetchTrigger, setRefetchTrigger] = React.useState(0);

  // Scatter tooltip hover state - keeps tooltip open when hovering over it
  const [hoveredPoint, setHoveredPoint] = React.useState<PredictionData | null>(
    null
  );
  const [isTooltipHovered, setIsTooltipHovered] = React.useState(false);
  const isTooltipHoveredRef = React.useRef(false);
  const tooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Comment square hover state - for comment popover
  const [hoveredComment, setHoveredComment] = React.useState<{
    x: number;
    y: number;
    data: PredictionData;
  } | null>(null);
  const commentTooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isCommentTooltipHoveredRef = React.useRef(false);

  const cancelCommentTooltipHide = () => {
    if (commentTooltipTimeoutRef.current) {
      clearTimeout(commentTooltipTimeoutRef.current);
      commentTooltipTimeoutRef.current = null;
    }
  };

  const scheduleCommentTooltipHide = (delayMs = 150) => {
    if (
      commentTooltipTimeoutRef.current == null &&
      !isCommentTooltipHoveredRef.current
    ) {
      commentTooltipTimeoutRef.current = setTimeout(() => {
        commentTooltipTimeoutRef.current = null;
        setHoveredComment(null);
      }, delayMs);
    }
  };

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

  const [isDescriptionExpanded, setIsDescriptionExpanded] =
    React.useState(false);

  const handleForecastSuccess = React.useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  // Determine chain ID from condition data or default
  const chainId = data?.chainId ?? DEFAULT_CHAIN_ID;

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
            makerPrediction: true, // Default to true for now until we have real trade data
            time: p.time,
            comment: p.comment || undefined, // Include comment from forecast
            attester: p.attester, // Forecaster's address
            predictionPercent, // Prediction as percentage (0-100)
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as PredictionData[];

    // If all real data failed to parse, fall back to placeholder
    return realData.length > 0 ? realData : placeholderPredictions;
  }, [predictions]);

  // Filter predictions that have comments for the comment scatter layer
  const commentScatterData = useMemo(() => {
    return scatterData.filter((d) => d.comment && d.comment.trim().length > 0);
  }, [scatterData]);

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
          const timestamp = row.original.x;
          const date = new Date(timestamp);
          const relativeTime = formatDistanceToNow(date, { addSuffix: true });
          const exactTime = date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          });
          return (
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground text-sm whitespace-nowrap cursor-help">
                    {relativeTime}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span>{exactTime}</span>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
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
              Wager
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
          <span className="text-foreground whitespace-nowrap">
            {row.original.wager} USDe
          </span>
        ),
        sortingFn: (rowA, rowB) => rowA.original.wager - rowB.original.wager,
      },
      {
        id: 'impliedForecast',
        header: () => (
          <span className="text-sm font-medium whitespace-nowrap">
            Forecast
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
        id: 'predictedYes',
        header: () => (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">Predicted</span>
            <Badge
              variant="outline"
              className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-yes/40 bg-yes/10 text-yes shrink-0 font-mono"
            >
              YES
            </Badge>
          </div>
        ),
        cell: ({ row }) => {
          const { maker, taker, makerPrediction } = row.original;
          const yesAddress = makerPrediction ? maker : taker;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <EnsAvatar address={yesAddress} width={16} height={16} />
              <AddressDisplay address={yesAddress} compact />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'predictedNo',
        header: () => (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">Predicted</span>
            <Badge
              variant="outline"
              className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-no/40 bg-no/10 text-no shrink-0 font-mono"
            >
              NO
            </Badge>
          </div>
        ),
        cell: ({ row }) => {
          const { maker, taker, makerPrediction } = row.original;
          const noAddress = makerPrediction ? taker : maker;
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <EnsAvatar address={noAddress} width={16} height={16} />
              <AddressDisplay address={noAddress} compact />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'combinedPrediction',
        header: () => (
          <span className="text-sm font-medium whitespace-nowrap">
            Combined
          </span>
        ),
        cell: ({ row }) => {
          const { combinedPredictions, combinedWithYes } = row.original;

          if (!combinedPredictions || combinedPredictions.length === 0) {
            return <span className="text-muted-foreground">—</span>;
          }

          const count = combinedPredictions.length;
          const getCategoryColor = (slug?: string) =>
            getCategoryStyle(slug).color;

          return (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 transition-colors whitespace-nowrap"
                >
                  {count} prediction{count !== 1 ? 's' : ''}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                align="start"
              >
                <div className="flex flex-col divide-y divide-brand-white/20">
                  <div className="flex items-center gap-2 px-3 py-3">
                    <span className="text-base font-medium text-brand-white">
                      Predicted with
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                        combinedWithYes
                          ? 'border-yes/40 bg-yes/10 text-yes'
                          : 'border-no/40 bg-no/10 text-no'
                      }`}
                    >
                      {combinedWithYes ? 'YES' : 'NO'}
                    </Badge>
                  </div>
                  {combinedPredictions.map((pred, i) => (
                    <div
                      key={`combined-${i}`}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <MarketBadge
                        label={pred.question}
                        size={32}
                        color={getCategoryColor(pred.categorySlug)}
                        categorySlug={pred.categorySlug}
                      />
                      <span className="text-sm flex-1 min-w-0 font-mono underline decoration-dotted underline-offset-2 hover:text-brand-white/80 transition-colors cursor-pointer truncate">
                        {pred.question}
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                          pred.prediction
                            ? 'border-yes/40 bg-yes/10 text-yes'
                            : 'border-no/40 bg-no/10 text-no'
                        }`}
                      >
                        {pred.prediction ? 'YES' : 'NO'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
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
                    {(() => {
                      // Get open interest from data and format it
                      const openInterestWei = data?.openInterest || '0';
                      try {
                        const etherValue = parseFloat(
                          formatEther(BigInt(openInterestWei))
                        );
                        const formattedValue = formatFiveSigFigs(etherValue);
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
          </div>

          {/* Row 1: Scatterplot (left) | Current Forecast + Prediction (right) - same height */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6 items-stretch">
            {/* Scatterplot - height matches the PredictionForm dynamically */}
            <div className="relative w-full min-h-[350px] bg-brand-black border border-border rounded-lg pt-6 pr-8 pb-2 pl-2">
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
                    wrapperStyle={{ pointerEvents: 'auto', zIndex: 50 }}
                    active={!!(hoveredPoint || isTooltipHovered)}
                    payload={
                      hoveredPoint ? [{ payload: hoveredPoint }] : undefined
                    }
                    content={({ active, payload }) => {
                      // Use hovered point state for persistent tooltip
                      const point =
                        hoveredPoint ||
                        (active &&
                          (payload?.[0]?.payload as
                            | PredictionData
                            | undefined));

                      if (!point) return null;

                      const date = new Date(point.x);
                      const relativeTime = formatDistanceToNow(date, {
                        addSuffix: true,
                      });
                      const exactTime = date.toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short',
                      });
                      const {
                        maker,
                        taker,
                        makerPrediction,
                        combinedPredictions,
                        combinedWithYes,
                      } = point;
                      const yesAddress = makerPrediction ? maker : taker;
                      const noAddress = makerPrediction ? taker : maker;
                      const getCategoryColor = (slug?: string) =>
                        getCategoryStyle(slug).color;

                      return (
                        <div
                          className="rounded-lg border scatter-tooltip overflow-hidden"
                          style={{
                            backgroundColor: 'hsl(var(--brand-black))',
                            border: '1px solid hsl(var(--brand-white) / 0.2)',
                          }}
                          onMouseEnter={() => {
                            if (tooltipTimeoutRef.current) {
                              clearTimeout(tooltipTimeoutRef.current);
                              tooltipTimeoutRef.current = null;
                            }
                            isTooltipHoveredRef.current = true;
                            setIsTooltipHovered(true);
                          }}
                          onMouseLeave={() => {
                            isTooltipHoveredRef.current = false;
                            setIsTooltipHovered(false);
                            tooltipTimeoutRef.current = setTimeout(() => {
                              setHoveredPoint(null);
                            }, 100);
                          }}
                        >
                          {/* Top section: Time, Forecast, Wager */}
                          <div className="px-3 py-2.5 space-y-2">
                            {/* Time row */}
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                                Time
                              </span>
                              <TooltipProvider>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm text-muted-foreground cursor-help">
                                      {relativeTime}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <span>{exactTime}</span>
                                  </TooltipContent>
                                </UITooltip>
                              </TooltipProvider>
                            </div>
                            {/* Wager row */}
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                                Wager
                              </span>
                              <span className="text-sm text-foreground">
                                {point.wager} USDe
                              </span>
                            </div>
                            {/* Forecast row */}
                            <div className="flex items-center justify-between gap-6">
                              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                                Forecast
                              </span>
                              <span className="font-mono text-sm text-ethena">
                                {point.y}% chance
                              </span>
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="border-t border-brand-white/10" />

                          {/* Middle section: YES/NO predictors */}
                          <div className="px-3 py-2.5 space-y-2">
                            {/* YES predictor */}
                            <div className="flex items-center justify-between gap-4">
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-yes/40 bg-yes/10 text-yes shrink-0 font-mono"
                              >
                                YES
                              </Badge>
                              <div className="flex items-center gap-1.5">
                                <EnsAvatar
                                  address={yesAddress}
                                  width={16}
                                  height={16}
                                />
                                <AddressDisplay address={yesAddress} compact />
                              </div>
                            </div>
                            {/* NO predictor */}
                            <div className="flex items-center justify-between gap-4">
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-no/40 bg-no/10 text-no shrink-0 font-mono"
                              >
                                NO
                              </Badge>
                              <div className="flex items-center gap-1.5">
                                <EnsAvatar
                                  address={noAddress}
                                  width={16}
                                  height={16}
                                />
                                <AddressDisplay address={noAddress} compact />
                              </div>
                            </div>
                          </div>

                          {/* Combined predictions section (if parlay) */}
                          {combinedPredictions &&
                            combinedPredictions.length > 0 && (
                              <>
                                <div className="border-t border-brand-white/10" />
                                <div className="px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                                      Combined
                                    </span>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 transition-colors whitespace-nowrap"
                                        >
                                          {combinedPredictions.length}{' '}
                                          prediction
                                          {combinedPredictions.length !== 1
                                            ? 's'
                                            : ''}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent
                                        className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                                        align="start"
                                      >
                                        <div className="flex flex-col divide-y divide-brand-white/20">
                                          <div className="flex items-center gap-3 px-3 py-2">
                                            <span className="text-sm text-brand-white">
                                              Predicted with
                                            </span>
                                            <Badge
                                              variant="outline"
                                              className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                                                combinedWithYes
                                                  ? 'border-yes/40 bg-yes/10 text-yes'
                                                  : 'border-no/40 bg-no/10 text-no'
                                              }`}
                                            >
                                              {combinedWithYes ? 'YES' : 'NO'}
                                            </Badge>
                                          </div>
                                          {combinedPredictions.map(
                                            (pred, i) => (
                                              <div
                                                key={`scatter-combined-${i}`}
                                                className="flex items-center gap-3 px-3 py-2"
                                              >
                                                <MarketBadge
                                                  label={pred.question}
                                                  size={32}
                                                  color={getCategoryColor(
                                                    pred.categorySlug
                                                  )}
                                                  categorySlug={
                                                    pred.categorySlug
                                                  }
                                                />
                                                <span className="text-sm flex-1 min-w-0 font-mono underline decoration-dotted underline-offset-2 hover:text-brand-white/80 transition-colors cursor-pointer truncate">
                                                  {pred.question}
                                                </span>
                                                <Badge
                                                  variant="outline"
                                                  className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                                                    pred.prediction
                                                      ? 'border-yes/40 bg-yes/10 text-yes'
                                                      : 'border-no/40 bg-no/10 text-no'
                                                  }`}
                                                >
                                                  {pred.prediction
                                                    ? 'YES'
                                                    : 'NO'}
                                                </Badge>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                </div>
                              </>
                            )}
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

                      // Check if this is a combined prediction (parlay)
                      if (payload?.combinedPredictions?.length > 0) {
                        // Render horizontal line with gradient ray
                        const width = radius * 2.5;
                        const lineWidth = width * 2;
                        const rayLength = lineWidth * 0.6; // Ray height proportional to line width
                        const gradientId = `bracket-ray-gradient-${payload.x}`;
                        // Determine ray direction based on combinedWithYes:
                        // - YES in parlay (combinedWithYes: true) → ray UP (floor/minimum)
                        // - NO in parlay (combinedWithYes: false) → ray DOWN (ceiling/maximum)
                        const rayUp = payload.combinedWithYes === true;
                        return (
                          <g
                            className="bracket-combined"
                            onMouseEnter={() => {
                              if (tooltipTimeoutRef.current) {
                                clearTimeout(tooltipTimeoutRef.current);
                                tooltipTimeoutRef.current = null;
                              }
                              setHoveredPoint(payload as PredictionData);
                            }}
                            onMouseLeave={() => {
                              // Delay clearing to allow moving to tooltip
                              tooltipTimeoutRef.current = setTimeout(() => {
                                if (!isTooltipHoveredRef.current) {
                                  setHoveredPoint(null);
                                }
                              }, 150);
                            }}
                          >
                            {/* Gradient definition for the ray - direction based on combinedWithYes */}
                            <defs>
                              <linearGradient
                                id={gradientId}
                                x1="0%"
                                y1="0%"
                                x2="0%"
                                y2="100%"
                              >
                                {rayUp ? (
                                  <>
                                    {/* UP: solid at bottom (100%), transparent at top (0%) */}
                                    <stop
                                      offset="0%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0"
                                    />
                                    <stop
                                      offset="30%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.1"
                                    />
                                    <stop
                                      offset="60%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.3"
                                    />
                                    <stop
                                      offset="85%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.6"
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.9"
                                    />
                                  </>
                                ) : (
                                  <>
                                    {/* DOWN: solid at top (0%), transparent at bottom (100%) */}
                                    <stop
                                      offset="0%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.9"
                                    />
                                    <stop
                                      offset="15%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.6"
                                    />
                                    <stop
                                      offset="40%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.3"
                                    />
                                    <stop
                                      offset="70%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0.1"
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="hsl(var(--ethena))"
                                      stopOpacity="0"
                                    />
                                  </>
                                )}
                              </linearGradient>
                            </defs>
                            {/* Gradient ray coming out of line - direction based on combinedWithYes */}
                            <rect
                              x={cx - width}
                              y={rayUp ? cy - rayLength : cy}
                              width={width * 2}
                              height={rayLength}
                              fill={`url(#${gradientId})`}
                              className="bracket-ray"
                            />
                            {/* Horizontal line */}
                            <line
                              x1={cx - width}
                              y1={cy}
                              x2={cx + width}
                              y2={cy}
                              stroke="hsl(var(--ethena) / 0.8)"
                              strokeWidth={2}
                              strokeLinecap="round"
                              className="scatter-dot"
                            />
                          </g>
                        );
                      }

                      // Regular circle for non-combined predictions
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={radius}
                          fill="hsl(var(--ethena) / 0.2)"
                          stroke="hsl(var(--ethena) / 0.8)"
                          strokeWidth={1.5}
                          className="scatter-dot"
                          onMouseEnter={() => {
                            if (tooltipTimeoutRef.current) {
                              clearTimeout(tooltipTimeoutRef.current);
                              tooltipTimeoutRef.current = null;
                            }
                            setHoveredPoint(payload as PredictionData);
                          }}
                          onMouseLeave={() => {
                            // Delay clearing to allow moving to tooltip
                            tooltipTimeoutRef.current = setTimeout(() => {
                              if (!isTooltipHoveredRef.current) {
                                setHoveredPoint(null);
                              }
                            }, 150);
                          }}
                        />
                      );
                    }}
                  />
                  {/* Comment squares - rendered on top of prediction dots */}
                  <Scatter
                    name="Comments"
                    data={commentScatterData}
                    fill="hsl(var(--brand-white))"
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      const size = 6;
                      const isHovered =
                        hoveredComment?.data?.x === payload?.x &&
                        hoveredComment?.data?.attester === payload?.attester;
                      return (
                        <rect
                          x={cx - size / 2}
                          y={cy - size / 2}
                          width={size}
                          height={size}
                          fill={
                            isHovered
                              ? 'hsl(var(--brand-white))'
                              : 'hsl(var(--brand-white) / 0.9)'
                          }
                          stroke="hsl(var(--brand-white))"
                          strokeWidth={1}
                          className="cursor-pointer"
                          style={{
                            filter: isHovered
                              ? 'drop-shadow(0 0 4px hsl(var(--brand-white) / 0.5))'
                              : undefined,
                          }}
                          onMouseEnter={() => {
                            cancelCommentTooltipHide();
                            if (
                              typeof cx === 'number' &&
                              typeof cy === 'number'
                            ) {
                              setHoveredComment({
                                x: cx,
                                y: cy,
                                data: payload as PredictionData,
                              });
                            }
                          }}
                          onMouseLeave={() => {
                            scheduleCommentTooltipHide(150);
                          }}
                        />
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>

              {/* Comment popover - positioned absolutely relative to scatter plot container */}
              <AnimatePresence>
                {hoveredComment && (
                  <motion.div
                    key={`comment-${hoveredComment.data.x}-${hoveredComment.data.attester}`}
                    className="absolute pointer-events-auto z-50"
                    style={{
                      left: hoveredComment.x,
                      top: hoveredComment.y,
                      transform: 'translate(8px, 8px)',
                    }}
                    onMouseEnter={() => {
                      isCommentTooltipHoveredRef.current = true;
                      cancelCommentTooltipHide();
                    }}
                    onMouseLeave={() => {
                      isCommentTooltipHoveredRef.current = false;
                      scheduleCommentTooltipHide(100);
                    }}
                    initial={{ opacity: 0, scale: 0.96, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 4 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  >
                    <div
                      className="rounded-lg border overflow-hidden max-w-[320px] min-w-[280px]"
                      style={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      }}
                    >
                      {/* Comment content */}
                      {hoveredComment.data.comment && (
                        <div className="p-3 border-b border-border">
                          <div className="text-sm leading-relaxed text-foreground/90 break-words">
                            {hoveredComment.data.comment}
                          </div>
                        </div>
                      )}

                      {/* Meta row: prediction badge, time, address */}
                      <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
                        {/* Prediction badge */}
                        {hoveredComment.data.predictionPercent !==
                          undefined && (
                          <Badge
                            variant="outline"
                            className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
                              hoveredComment.data.predictionPercent > 50
                                ? 'border-yes/40 bg-yes/10 text-yes'
                                : hoveredComment.data.predictionPercent < 50
                                  ? 'border-no/40 bg-no/10 text-no'
                                  : 'border-muted-foreground/40 bg-muted/10 text-muted-foreground'
                            }`}
                          >
                            {hoveredComment.data.predictionPercent}% chance
                          </Badge>
                        )}

                        {/* Time */}
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDistanceToNow(
                            new Date(hoveredComment.data.x),
                            { addSuffix: true }
                          )}
                        </span>

                        {/* Author */}
                        {hoveredComment.data.attester && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <EnsAvatar
                              address={hoveredComment.data.attester}
                              className="w-4 h-4 rounded-sm"
                              width={16}
                              height={16}
                            />
                            <AddressDisplay
                              address={hoveredComment.data.attester}
                              compact
                              disablePopover
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 mb-12">
            {/* Predictions/Forecasts - Unified container with integrated tabs */}
            <Tabs defaultValue="predictions" className="w-full">
              <div className="border border-border/60 rounded-lg overflow-hidden bg-brand-black">
                {/* Header with integrated tabs */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/60 bg-muted/10">
                  <TabsList className="h-auto p-0 bg-transparent gap-1">
                    <TabsTrigger
                      value="predictions"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors inline-flex items-center gap-1.5"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Predictions
                    </TabsTrigger>
                    <TabsTrigger
                      value="forecasts"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors inline-flex items-center gap-1.5"
                    >
                      <Telescope className="h-3.5 w-3.5" />
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
                                    className="px-4 py-1 text-left text-sm font-medium text-muted-foreground"
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
                      resolver={
                        umaResolver[data.chainId ?? 42161]?.address ?? ''
                      }
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
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors inline-flex items-center gap-1.5"
                    >
                      <Gavel className="h-3.5 w-3.5 -scale-x-100" />
                      Resolution
                    </TabsTrigger>
                    <TabsTrigger
                      value="contracts"
                      className="px-3 py-1.5 text-sm rounded-md bg-brand-white/[0.03] data-[state=active]:bg-brand-white/10 data-[state=active]:text-brand-white text-muted-foreground hover:text-brand-white/80 hover:bg-brand-white/[0.06] transition-colors inline-flex items-center gap-1.5"
                    >
                      <Code className="h-3.5 w-3.5" />
                      Tech Spec
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
                            height: isDescriptionExpanded ? 'auto' : '12em',
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
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">
                          Market
                        </td>
                        <td className="px-4 py-3 text-brand-white font-mono text-sm break-all">
                          {(() => {
                            const chainId = data.chainId ?? 42161;
                            const address = predictionMarket[chainId]?.address;
                            if (!address) return '—';
                            return (
                              <span className="inline-flex items-center gap-1.5">
                                {`${address.slice(0, 6)}...${address.slice(-4)}`}
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigator.clipboard.writeText(address)
                                  }
                                  className="text-muted-foreground hover:text-brand-white transition-colors"
                                  title="Copy full market address"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">
                          Resolver
                        </td>
                        <td className="px-4 py-3 text-brand-white font-mono text-sm break-all">
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
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">
                          Question ID
                        </td>
                        <td className="px-4 py-3 text-brand-white font-mono text-sm break-all">
                          <span className="inline-flex items-center gap-1.5">
                            {`${conditionId.slice(0, 6)}...${conditionId.slice(-4)}`}
                            <button
                              type="button"
                              onClick={() =>
                                navigator.clipboard.writeText(conditionId)
                              }
                              className="text-muted-foreground hover:text-brand-white transition-colors"
                              title="Copy full condition ID"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </span>
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
        .bracket-combined {
          cursor: pointer;
        }
        .bracket-ray {
          opacity: 0.5;
          transition: opacity 150ms ease-out;
        }
        .bracket-combined:hover .bracket-ray {
          animation: ray-pulse 2.5s ease-in-out infinite;
        }
        @keyframes ray-pulse {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.85;
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
