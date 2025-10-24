import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/sdk/ui/components/ui/select';

import columns from './columns';
import DataTable from './data-table';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';

const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

type MarketFilter = 'all' | 'needs-settlement' | 'active' | 'settled';

const LiquidTab = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();
  const [filter, setFilter] = useState<MarketFilter>('all');

  const filteredMarketGroups = useMemo(() => {
    if (!marketGroups) return [];

    const now = Math.floor(Date.now() / 1000);

    return marketGroups.filter((group) => {
      if (filter === 'all') return true;

      const hasNeedsSettlement = group.markets?.some((m) => {
        const isPastEnd = m.endTimestamp && m.endTimestamp < now;
        const isNotSettled = m.settled === false || m.settled === null;
        return isPastEnd && isNotSettled;
      });

      const hasActive = group.markets?.some(
        (m) => m.endTimestamp && m.endTimestamp >= now
      );

      const hasSettled = group.markets?.some(
        (m) => m.settled === true
      );

      if (filter === 'needs-settlement') return hasNeedsSettlement;
      if (filter === 'active') return hasActive && !hasNeedsSettlement;
      if (filter === 'settled') return hasSettled && !hasNeedsSettlement && !hasActive;

      return true;
    });
  }, [marketGroups, filter]);

  return (
    <div className="space-y-4">
      {/* Filter Dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Filter:</span>
        <Select value={filter} onValueChange={(value) => setFilter(value as MarketFilter)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Show All</SelectItem>
            <SelectItem value="needs-settlement">Needs Settlement</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="settled">Settled</SelectItem>
          </SelectContent>
        </Select>
        {filter !== 'all' && (
          <span className="text-sm text-muted-foreground">
            ({filteredMarketGroups.length} {filteredMarketGroups.length === 1 ? 'market' : 'markets'})
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <LottieLoader width={32} height={32} />
        </div>
      )}

      {/* Error State */}
      {error && (
        <p className="text-red-500">Error loading markets: {error.message}</p>
      )}

      {/* Data Table */}
      {!isLoading && filteredMarketGroups.length > 0 ? (
        <DataTable columns={columns} data={filteredMarketGroups} />
      ) : (
        !isLoading && !error && (
          <p className="text-muted-foreground">
            {filter === 'all' 
              ? 'No market groups found.' 
              : `No ${filter.replace('-', ' ')} markets found.`}
          </p>
        )
      )}
    </div>
  );
};

export default LiquidTab;
