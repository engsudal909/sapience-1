'use client';

import { useIsBelow } from '@sapience/sdk/ui/hooks/use-mobile';
import { useIsMobile } from '@sapience/sdk/ui/hooks/use-mobile';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { type Market as GraphQLMarketType } from '@sapience/sdk/types/graphql';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  useEnrichedMarketGroups,
  useCategories,
} from '~/hooks/graphql/useMarketGroups';
import {
  useConditions,
  type ConditionFilters,
} from '~/hooks/graphql/useConditions';
import Betslip from '~/components/markets/Betslip';
import SuggestedBetslips from '~/components/markets/SuggestedBetslips';
import MarketsDataTable from '~/components/markets/MarketsDataTable';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import type { FilterState } from '~/components/markets/TableFilters';
import { useDebouncedValue } from '~/hooks/useDebouncedValue';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

// Define local interfaces based on expected data shape
export interface MarketWithContext extends GraphQLMarketType {
  marketAddress: string;
  chainId: number;
  collateralAsset: string;
  categorySlug: string;
  categoryId: string;
}

// Helper to convert days from now to Unix timestamp
function daysFromNowToTimestamp(days: number): number {
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec + days * 86400;
}

const MarketsPage = () => {
  // Use the new hook and update variable names
  const { isLoading: isLoadingMarketGroups, refetch: refetchMarketGroups } =
    useEnrichedMarketGroups();
  const { data: allCategories = [], isLoading: isLoadingCategories } =
    useCategories();

  // Parlay Mode toggle
  const [parlayMode, setParlayMode] = React.useState<boolean>(true);

  // Initialize parlay mode from URL hash unconditionally
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    // New: '#spot' indicates singles mode; default (no hash) is parlays
    if (window.location.hash === '#spot') {
      setParlayMode(false);
    } else if (window.location.hash === '#parlays') {
      // Migrate legacy '#parlays' to default (no hash)
      const url = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url);
      setParlayMode(true);
    }
  }, []);

  // Handle parlay mode toggle and keep URL hash in sync
  const handleParlayModeChange = (enabled: boolean) => {
    setParlayMode(enabled);
    if (typeof window === 'undefined') return;
    if (!enabled) {
      const newHash = '#spot';
      if (window.location.hash !== newHash) {
        // Update hash without scrolling or adding a new history entry
        window.history.replaceState(null, '', newHash);
      }
    } else {
      // Clear hash entirely for default parlays view
      const url = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url);
    }
  };

  // Read chainId from localStorage with event monitoring
  const chainId = useChainIdFromLocalStorage();

  // Filter state managed here, passed down to MarketsDataTable
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    openInterestRange: [0, 100000],
    timeToResolutionRange: [0, 1000], // Default to future markets only
    selectedCategories: [],
  });

  // Debounce search term for backend queries (300ms)
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Convert UI filter state to backend filter format
  const backendFilters = useMemo((): ConditionFilters => {
    const result: ConditionFilters = {
      publicOnly: true, // Always filter to public conditions
    };

    // Search filter (debounced)
    if (debouncedSearchTerm.trim()) {
      result.search = debouncedSearchTerm.trim();
    }

    // Category filter
    if (filters.selectedCategories.length > 0) {
      result.categorySlugs = filters.selectedCategories;
    }

    // Time to resolution filter (convert days to timestamps)
    const [minDays, maxDays] = filters.timeToResolutionRange;
    // Only apply if not at the extreme bounds (-1000 to 1000)
    if (minDays > -1000) {
      result.endTimeGte = daysFromNowToTimestamp(minDays);
    }
    if (maxDays < 1000) {
      result.endTimeLte = daysFromNowToTimestamp(maxDays);
    }

    return result;
  }, [debouncedSearchTerm, filters]);

  // RFQ Conditions via GraphQL with backend filtering
  const { data: allConditions = [], isLoading: isLoadingConditions } =
    useConditions({
      take: 200,
      chainId,
      filters: backendFilters,
    });

  // Refetch data when chainId changes
  useEffect(() => {
    // useConditions will automatically refetch when chainId changes (it's in the queryKey)
    // But we need to manually refetch marketGroups since chainId is not in its queryKey
    refetchMarketGroups();
  }, [chainId, refetchMarketGroups]);

  // Callbacks for filter changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  // Convert categories to the format expected by TableFilters
  const categoryOptions = useMemo(() => {
    return allCategories
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCategories]);

  // Get mobile/compact status
  const isMobile = useIsMobile();
  const isCompact = useIsBelow(1024);

  // Show loader only on initial load (not when filtering)
  if (isLoadingMarketGroups || isLoadingCategories) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-theme(spacing.20))] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  // Render content once both are loaded
  return (
    <div className="relative w-full max-w-full overflow-visible flex flex-col lg:flex-row items-start">
      {/* Render only one betslip instance based on viewport */}
      {isCompact ? (
        <div className="block lg:hidden">
          <Betslip
            isParlayMode={parlayMode}
            onParlayModeChange={handleParlayModeChange}
          />
        </div>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 min-w-0 max-w-full overflow-visible flex flex-col gap-4 pr-0 lg:pr-4 pb-4 lg:pb-0">
        {/* Featured Parlays section - shown when in parlay mode */}
        {parlayMode ? <SuggestedBetslips className="mt-4 md:mt-0" /> : null}

        {/* Results area - always table view */}
        <div className="relative w-full max-w-full overflow-x-hidden min-h-[300px]">
          <motion.div
            key="table-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <MarketsDataTable
              conditions={allConditions}
              isLoading={isLoadingConditions}
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              categories={categoryOptions}
            />
          </motion.div>
        </div>
      </div>

      {/* Desktop/Tablet sticky betslip sidebar */}
      {!isMobile ? (
        <div className="hidden lg:block w-[24rem] shrink-0 self-start sticky top-24 z-30 lg:ml-1 xl:ml-2 lg:mr-6">
          <div className="rounded-none shadow-lg overflow-hidden h-[calc(100dvh-96px)]">
            <div className="h-full overflow-y-auto">
              <Betslip
                variant="panel"
                isParlayMode={parlayMode}
                onParlayModeChange={handleParlayModeChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MarketsPage;
