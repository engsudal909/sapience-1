'use client';

import { useIsBelow } from '@sapience/sdk/ui/hooks/use-mobile';
import { useIsMobile } from '@sapience/sdk/ui/hooks/use-mobile';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { type Market as GraphQLMarketType } from '@sapience/sdk/types/graphql';
import { useEffect } from 'react';
import {
  useEnrichedMarketGroups,
  useCategories,
} from '~/hooks/graphql/useMarketGroups';
import { useConditions } from '~/hooks/graphql/useConditions';
import Betslip from '~/components/markets/Betslip';
import SuggestedBetslips from '~/components/markets/SuggestedBetslips';
import MarketsDataTable from '~/components/markets/MarketsDataTable';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

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

const MarketsPage = () => {
  // Use the new hook and update variable names
  const { isLoading: isLoadingMarketGroups, refetch: refetchMarketGroups } =
    useEnrichedMarketGroups();
  const { isLoading: isLoadingCategories } = useCategories();

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

  // RFQ Conditions via GraphQL
  const { data: allConditions = [] } = useConditions({ take: 200, chainId });

  // Refetch data when chainId changes
  useEffect(() => {
    // useConditions will automatically refetch when chainId changes (it's in the queryKey)
    // But we need to manually refetch marketGroups since chainId is not in its queryKey
    refetchMarketGroups();
  }, [chainId, refetchMarketGroups]);

  // Get mobile/compact status
  const isMobile = useIsMobile();
  const isCompact = useIsBelow(1024);

  // Show loader if either query is loading
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
      <div className="flex-1 min-w-0 max-w-full overflow-visible flex flex-col gap-4 pr-0 lg:pr-4 pb-16 lg:pb-0">
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
              conditions={allConditions.filter((c) => c.public)}
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
