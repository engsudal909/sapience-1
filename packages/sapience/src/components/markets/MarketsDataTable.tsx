'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/sdk/ui/components/ui/table';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/sdk/ui/components/ui/select';
import type {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { useReadContract } from 'wagmi';
import { toHex, concatHex, keccak256 } from 'viem';
import { umaResolver } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import type { ConditionType } from '~/hooks/graphql/useConditions';
import ConditionTitleLink from './ConditionTitleLink';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import MarketBadge from './MarketBadge';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import TableFilters, { type FilterState } from './TableFilters';

interface MarketsDataTableProps {
  conditions: ConditionType[];
}

// Helper to convert endTime to days from now (negative = ended)
function getTimeToResolutionDays(endTime: number): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = endTime - nowSec;
  return Math.round(diffSec / 86400); // Convert to days
}

// Countdown display component with live updates
function CountdownCell({ endTime }: { endTime: number }) {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    // Set initial time on mount (client-side only)
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // endTime is in seconds, convert to milliseconds
  const endMs = endTime * 1000;
  const date = new Date(endMs);

  // Format the full date with timezone for tooltip
  const fullDateTime = format(date, "MMMM d, yyyy 'at' h:mm:ss a zzz");

  // Show loading state until client-side hydration
  if (nowMs === null) {
    return (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        —
      </span>
    );
  }

  const diff = endMs - nowMs;
  const isPast = diff <= 0;

  // Calculate countdown parts
  const formatCountdown = () => {
    if (isPast) {
      return 'Ended';
    }

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const d = days;
    const h = hours % 24;
    const m = minutes % 60;
    const s = seconds % 60;

    if (days > 0) {
      return `${d}d ${h}h ${m}m`;
    }
    if (hours > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    if (minutes > 0) {
      return `${m}m ${s}s`;
    }
    return `${s}s`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`whitespace-nowrap tabular-nums cursor-default ${isPast ? 'text-muted-foreground' : 'font-mono text-brand-white'}`}
          >
            {formatCountdown()}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span>{fullDateTime}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper to get category color
const getCategoryColor = (categorySlug?: string | null): string => {
  if (!categorySlug) return 'hsl(var(--muted-foreground))';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);
  if (focusArea) return focusArea.color;
  return getDeterministicCategoryColor(categorySlug);
};

// UMA resolver ABI for wrappedMarkets query
const umaWrappedMarketAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'wrappedMarkets',
    outputs: [
      { internalType: 'bool', name: 'initialized', type: 'bool' },
      { internalType: 'bool', name: 'resolved', type: 'bool' },
      { internalType: 'bool', name: 'payout', type: 'bool' },
      { internalType: 'bytes32', name: 'assertionId', type: 'bytes32' },
      { internalType: 'uint8', name: 'payoutStatus', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Forecast cell that shows prediction request or resolution status
function ForecastCell({ condition }: { condition: ConditionType }) {
  const { claimStatement, endTime } = condition;

  // Check if past end time synchronously (no state needed)
  const nowSec = Math.floor(Date.now() / 1000);
  const isPastEnd = !!endTime && endTime <= nowSec;

  const UMA_CHAIN_ID = DEFAULT_CHAIN_ID;
  const UMA_RESOLVER_ADDRESS = umaResolver[DEFAULT_CHAIN_ID]?.address;

  // Compute marketId from claimStatement + endTime (only if past end)
  const marketId = React.useMemo(() => {
    if (!isPastEnd) return undefined;
    try {
      if (claimStatement && endTime) {
        const claimHex = toHex(claimStatement);
        const colonHex = toHex(':');
        const endTimeHex = toHex(BigInt(endTime), { size: 32 });
        const packed = concatHex([claimHex, colonHex, endTimeHex]);
        return keccak256(packed);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }, [claimStatement, endTime, isPastEnd]);

  // Query UMA resolver for settlement status (only when condition has ended)
  const { data: umaData, isLoading: umaLoading } = useReadContract({
    address: UMA_RESOLVER_ADDRESS,
    abi: umaWrappedMarketAbi,
    functionName: 'wrappedMarkets',
    args: marketId ? [marketId] : undefined,
    chainId: UMA_CHAIN_ID,
    query: { enabled: isPastEnd && Boolean(marketId && UMA_RESOLVER_ADDRESS) },
  });

  // If not past end time, show the regular prediction request
  if (!isPastEnd) {
    return <MarketPredictionRequest conditionId={condition.id} eager={false} />;
  }

  // Past end time - show resolution status
  if (umaLoading) {
    return <span className="text-muted-foreground">Loading...</span>;
  }

  const tuple = umaData as
    | [boolean, boolean, boolean, `0x${string}`, number]
    | undefined;
  const resolved = Boolean(tuple?.[1]);
  const payout = Boolean(tuple?.[2]);

  if (!resolved) {
    return <span className="text-muted-foreground">Resolution Pending</span>;
  }

  // Resolved - show Yes or No
  return (
    <span className={payout ? 'text-yes font-medium' : 'text-no font-medium'}>
      Resolved: {payout ? 'Yes' : 'No'}
    </span>
  );
}

// Predict buttons cell component
function PredictCell({ condition }: { condition: ConditionType }) {
  const { addParlaySelection, removeParlaySelection, parlaySelections } =
    useBetSlipContext();

  const displayQ = condition.shortName || condition.question;

  const selectionState = React.useMemo(() => {
    if (!condition.id) return { selectedYes: false, selectedNo: false };
    const existing = parlaySelections.find(
      (s) => s.conditionId === condition.id
    );
    return {
      selectedYes: !!existing && existing.prediction === true,
      selectedNo: !!existing && existing.prediction === false,
    };
  }, [parlaySelections, condition.id]);

  const handleYes = React.useCallback(() => {
    if (!condition.id) return;
    const existing = parlaySelections.find(
      (s) => s.conditionId === condition.id
    );
    if (existing && existing.prediction === true) {
      removeParlaySelection(existing.id);
      return;
    }
    addParlaySelection({
      conditionId: condition.id,
      question: displayQ,
      prediction: true,
    });
  }, [
    condition.id,
    displayQ,
    parlaySelections,
    removeParlaySelection,
    addParlaySelection,
  ]);

  const handleNo = React.useCallback(() => {
    if (!condition.id) return;
    const existing = parlaySelections.find(
      (s) => s.conditionId === condition.id
    );
    if (existing && existing.prediction === false) {
      removeParlaySelection(existing.id);
      return;
    }
    addParlaySelection({
      conditionId: condition.id,
      question: displayQ,
      prediction: false,
    });
  }, [
    condition.id,
    displayQ,
    parlaySelections,
    removeParlaySelection,
    addParlaySelection,
  ]);

  return (
    <div className="w-full max-w-[320px] font-mono ml-auto">
      <YesNoSplitButton
        onYes={handleYes}
        onNo={handleNo}
        className="w-full gap-4"
        size="sm"
        yesLabel="YES"
        noLabel="NO"
        selectedYes={selectionState.selectedYes}
        selectedNo={selectionState.selectedNo}
      />
    </div>
  );
}

const columns: ColumnDef<ConditionType>[] = [
  {
    accessorKey: 'question',
    header: () => <span>Question</span>,
    enableSorting: false,
    size: 400,
    maxSize: 500,
    cell: ({ row }) => {
      const condition = row.original;
      const categorySlug = condition.category?.slug;
      const color = getCategoryColor(categorySlug);
      const displayQ = condition.shortName || condition.question;
      return (
        <div className="flex items-center gap-3 max-w-[500px]">
          <MarketBadge
            label={displayQ}
            size={32}
            color={color}
            categorySlug={categorySlug}
          />
          <ConditionTitleLink
            conditionId={condition.id}
            title={displayQ}
            endTime={condition.endTime}
            description={condition.description}
            clampLines={1}
            className="text-base"
          />
        </div>
      );
    },
  },
  {
    id: 'forecast',
    header: () => (
      <span className="block text-right whitespace-nowrap">
        Current Forecast
      </span>
    ),
    cell: ({ row }) => {
      const condition = row.original;
      return (
        <div className="text-sm whitespace-nowrap">
          <ForecastCell condition={condition} />
        </div>
      );
    },
  },
  {
    id: 'openInterest',
    header: ({ column }) => (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-mr-4 px-0 hover:bg-transparent whitespace-nowrap"
        >
          Open Interest
          <ArrowUpDown className="ml-1 h-4 w-4" />
        </Button>
      </div>
    ),
    cell: () => {
      return (
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          X USDe
        </span>
      );
    },
    // Placeholder sorting - will need real data later
    sortingFn: () => 0,
  },
  {
    accessorKey: 'endTime',
    header: ({ column }) => (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-mr-4 px-0 hover:bg-transparent whitespace-nowrap"
        >
          Ends
          <ArrowUpDown className="ml-1 h-4 w-4" />
        </Button>
      </div>
    ),
    cell: ({ row }) => {
      const endTime = row.original.endTime;
      if (!endTime) return <span className="text-muted-foreground">—</span>;
      return <CountdownCell endTime={endTime} />;
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.endTime ?? 0;
      const b = rowB.original.endTime ?? 0;
      return a - b;
    },
  },
  {
    id: 'predict',
    header: () => null,
    cell: ({ row }) => {
      return <PredictCell condition={row.original} />;
    },
    enableSorting: false,
    enableHiding: false,
  },
];

export default function MarketsDataTable({
  conditions,
}: MarketsDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'openInterest', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );

  // Local search state managed by TableFilters
  const [searchTerm, setSearchTerm] = React.useState('');

  // Extract unique categories from conditions
  const availableCategories = React.useMemo(() => {
    const categoryMap = new Map<
      string,
      { id: number; name: string; slug: string }
    >();
    conditions.forEach((c) => {
      if (c.category?.slug && c.category?.name) {
        categoryMap.set(c.category.slug, {
          id: c.category.id,
          name: c.category.name,
          slug: c.category.slug,
        });
      }
    });
    return Array.from(categoryMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [conditions]);

  // Compute bounds for filters from the conditions data
  const filterBounds = React.useMemo(() => {
    // Open interest bounds (placeholder since data isn't available yet)
    const openInterestBounds: [number, number] = [0, 100000];

    // Time to resolution bounds (in days)
    const timeToResolutionValues = conditions
      .filter((c) => c.endTime)
      .map((c) => getTimeToResolutionDays(c.endTime));

    const minTime =
      timeToResolutionValues.length > 0
        ? Math.min(...timeToResolutionValues)
        : -30;
    const maxTime =
      timeToResolutionValues.length > 0
        ? Math.max(...timeToResolutionValues)
        : 365;

    // Round bounds to nice numbers
    const timeToResolutionBounds: [number, number] = [
      Math.floor(minTime / 10) * 10,
      Math.ceil(maxTime / 10) * 10,
    ];

    return { openInterestBounds, timeToResolutionBounds };
  }, [conditions]);

  // Filter state - default to only showing future markets (time >= 0)
  const [filters, setFilters] = React.useState<FilterState>({
    openInterestRange: filterBounds.openInterestBounds,
    timeToResolutionRange: [0, 1000],
    selectedCategories: [],
  });

  // Reset filters when bounds change (e.g., different data loaded)
  React.useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      openInterestRange: filterBounds.openInterestBounds,
    }));
  }, [filterBounds.openInterestBounds]);

  // Filter conditions based on search term and range filters
  const filteredConditions = React.useMemo(() => {
    let result = conditions;

    // Apply search filter
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((c) => {
        const haystacks: string[] = [];
        if (c.question) haystacks.push(c.question);
        if (c.shortName) haystacks.push(c.shortName);
        if (c.claimStatement) haystacks.push(c.claimStatement);
        if (c.description) haystacks.push(c.description);
        if (c.category?.name) haystacks.push(c.category.name);
        if (c.similarMarkets) haystacks.push(...c.similarMarkets);
        return haystacks.some((h) => h.toLowerCase().includes(lower));
      });
    }

    // Apply category filter
    const { selectedCategories } = filters;
    if (
      selectedCategories.length > 0 &&
      selectedCategories.length < availableCategories.length
    ) {
      result = result.filter((c) => {
        if (!c.category?.slug) return false;
        return selectedCategories.includes(c.category.slug);
      });
    }

    // Apply time to resolution filter
    const [minDays, maxDays] = filters.timeToResolutionRange;
    const isTimeFilterActive = minDays !== -1000 || maxDays !== 1000;

    if (isTimeFilterActive) {
      result = result.filter((c) => {
        if (!c.endTime) return true; // Keep items without endTime
        const days = getTimeToResolutionDays(c.endTime);
        return days >= minDays && days <= maxDays;
      });
    }

    // Note: Open interest filter not applied yet since data isn't available

    return result;
  }, [
    conditions,
    searchTerm,
    filters,
    filterBounds.timeToResolutionBounds,
    availableCategories.length,
  ]);

  const table = useReactTable({
    data: filteredConditions,
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  return (
    <div className="space-y-4">
      <TableFilters
        filters={filters}
        onFiltersChange={setFilters}
        openInterestBounds={filterBounds.openInterestBounds}
        timeToResolutionBounds={filterBounds.timeToResolutionBounds}
        categories={availableCategories}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        className="mt-4"
      />
      <div className="rounded-md border border-brand-white/20 overflow-hidden bg-brand-black">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:bg-transparent bg-muted/30"
              >
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;
                  let className = '';
                  if (colId === 'question') {
                    className = 'pl-4 max-w-[500px]';
                  }
                  return (
                    <TableHead key={header.id} className={className}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-b border-brand-white/20"
                >
                  {row.getVisibleCells().map((cell) => {
                    const colId = cell.column.id;
                    let className = 'py-2';
                    if (colId === 'question') {
                      className = 'py-2 pl-4 max-w-[500px]';
                    } else if (
                      colId === 'forecast' ||
                      colId === 'openInterest' ||
                      colId === 'endTime'
                    ) {
                      className = 'py-2 text-right';
                    } else if (colId === 'predict') {
                      className = 'py-2 pr-4';
                    }
                    return (
                      <TableCell key={cell.id} className={className}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} total questions
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
