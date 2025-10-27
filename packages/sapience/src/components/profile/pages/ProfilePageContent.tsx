'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Address } from 'viem';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';

import {
  Telescope,
  SquareStackIcon,
  ArrowLeftRightIcon,
  DropletsIcon,
} from 'lucide-react';
import ProfileHeader from '~/components/profile/ProfileHeader';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import ClosedTraderPositionsTable from '~/components/profile/ClosedTraderPositionsTable';
import LpPositionsTable from '~/components/profile/LpPositionsTable';
import ForecastsTable from '~/components/profile/ForecastsTable';
import UserParlaysTable from '~/components/parlays/UserParlaysTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import { useForecasts } from '~/hooks/graphql/useForecasts';
import { useUserParlays } from '~/hooks/graphql/useUserParlays';
import { SCHEMA_UID } from '~/lib/constants/eas';
import LottieLoader from '~/components/shared/LottieLoader';
import EmptyProfileState from '~/components/profile/EmptyProfileState';
import EmptyTabState from '~/components/shared/EmptyTabState';
import ProfileQuickMetrics from '~/components/profile/ProfileQuickMetrics';
import ShareAfterRedirect from '~/components/shared/ShareAfterRedirect';

const TAB_VALUES = ['parlays', 'trades', 'lp', 'forecasts'] as const;
type TabValue = (typeof TAB_VALUES)[number];

// (removed segmented tab background helper)

const ProfilePageContent = () => {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Address;

  // Remove parlay feature flag; Parlays tab is always available

  const {
    data: positionsData,
    isLoading: positionsLoading,
    isFetching: positionsFetching,
  } = usePositions({
    address,
  });
  const traderPositions = (positionsData || []).filter((p) => !p.isLP);
  const traderPositionsOpen = traderPositions.filter((p) => {
    try {
      const collateralStr = p.collateral ?? '0';
      const hasCollateral = BigInt(collateralStr) > 0n;
      return hasCollateral && !p.isSettled;
    } catch {
      return !p.isSettled;
    }
  });
  const traderPositionsClosed = traderPositions.filter((p) => {
    try {
      const collateralStr = p.collateral ?? '0';
      const hasCollateral = BigInt(collateralStr) > 0n;
      return !hasCollateral || !!p.isSettled;
    } catch {
      return !!p.isSettled;
    }
  });
  const lpPositions = (positionsData || []).filter((p) => p.isLP);

  const { data: attestations, isLoading: forecastsLoading } = useForecasts({
    attesterAddress: address,
    schemaId: SCHEMA_UID,
  });

  // Parlays for this profile address
  const { data: parlays, isLoading: parlaysLoading } = useUserParlays({
    address: String(address),
  });

  const allLoaded =
    !positionsLoading &&
    !forecastsLoading &&
    !positionsFetching &&
    !parlaysLoading;

  const hasTrades = traderPositions.length > 0;
  const hasLp = lpPositions.length > 0;
  const hasForecasts = (attestations?.length || 0) > 0;
  const hasParlays = (parlays?.length || 0) > 0;

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (allLoaded && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [allLoaded, hasLoadedOnce]);

  const getHashValue = () => {
    if (typeof window === 'undefined') return 'parlays' as TabValue;
    const rawHash = window.location.hash?.replace('#', '').toLowerCase();
    const desired = (TAB_VALUES as readonly string[]).includes(rawHash)
      ? (rawHash as TabValue)
      : ('parlays' as TabValue);
    return desired;
  };

  const [tabValue, setTabValue] = useState<TabValue>('parlays');

  useEffect(() => {
    setTabValue(getHashValue());
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setTabValue(getHashValue());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
    };
  }, []);

  const handleTabChange = (value: string) => {
    const nextValue = (TAB_VALUES as readonly string[]).includes(value)
      ? (value as TabValue)
      : ('parlays' as TabValue);
    setTabValue(nextValue);
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#${nextValue}`;
      window.history.replaceState(null, '', url);
    }
  };

  const didAutoRedirectRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedOnce || didAutoRedirectRef.current) return;

    const rawHash =
      typeof window !== 'undefined'
        ? window.location.hash?.replace('#', '').toLowerCase()
        : '';
    const hasExplicitHash = (TAB_VALUES as readonly string[]).includes(rawHash);
    if (hasExplicitHash) {
      didAutoRedirectRef.current = true;
      return;
    }

    const tabHasContent = (tab: TabValue): boolean => {
      if (tab === 'trades') return hasTrades;
      if (tab === 'parlays') return hasParlays;
      if (tab === 'lp') return hasLp;
      if (tab === 'forecasts') return hasForecasts;
      return false;
    };

    // If current tab already has content, do nothing further
    if (tabHasContent(tabValue)) {
      didAutoRedirectRef.current = true;
      return;
    }

    const firstWithContent: TabValue | null = hasParlays
      ? 'parlays'
      : hasTrades
        ? 'trades'
        : hasLp
          ? 'lp'
          : hasForecasts
            ? 'forecasts'
            : null;

    if (firstWithContent && tabValue !== firstWithContent) {
      handleTabChange(firstWithContent);
    }
    // Mark as done to avoid overriding user interactions later
    didAutoRedirectRef.current = true;
  }, [hasLoadedOnce, hasTrades, hasLp, hasForecasts]);

  return (
    <div className="mx-auto pt-24 lg:pt-24 pb-0 px-3 md:px-6 lg:px-8 w-full">
      <ShareAfterRedirect address={address} />
      <div className="mb-6">
        <ProfileHeader address={address} className="mb-0" />
      </div>

      <div className="mb-5">
        {hasLoadedOnce ? (
          <ProfileQuickMetrics
            address={address}
            forecastsCount={attestations?.length ?? 0}
            positions={positionsData ?? []}
            parlays={parlays ?? []}
          />
        ) : null}
      </div>

      {hasLoadedOnce ? (
        !(hasTrades || hasParlays || hasLp || hasForecasts) ? (
          <EmptyProfileState />
        ) : (
          <div className="-mx-3 md:-mx-6 lg:-mx-8 bg-brand-black pb-0">
            <Tabs
              value={tabValue}
              onValueChange={handleTabChange}
              className="w-full"
            >
              <TabsList className="!grid h-auto w-full grid-cols-1 lg:grid-cols-4 gap-2 mb-0 rounded-none px-3">
                <TabsTrigger
                  className="w-full justify-center transition-colors hover:text-brand-white/80 data-[state=active]:text-brand-white"
                  value="parlays"
                >
                  <SquareStackIcon className="h-4 w-4 mr-2" />
                  Parlays
                </TabsTrigger>
                <TabsTrigger
                  className="w-full justify-center transition-colors hover:text-brand-white/80 data-[state=active]:text-brand-white"
                  value="trades"
                >
                  <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
                  Spot Trades
                </TabsTrigger>
                <TabsTrigger
                  className="w-full justify-center transition-colors hover:text-brand-white/80 data-[state=active]:text-brand-white"
                  value="lp"
                >
                  <DropletsIcon className="h-4 w-4 mr-2" />
                  Spot Liquidity
                </TabsTrigger>
                <TabsTrigger
                  className="w-full justify-center transition-colors hover:text-brand-white/80 data-[state=active]:text-brand-white"
                  value="forecasts"
                >
                  <Telescope className="h-4 w-4 mr-2" />
                  Forecasts
                </TabsTrigger>
              </TabsList>

              <TabsContent value="parlays" className="mt-0">
                <UserParlaysTable account={address} showHeaderText={false} />
              </TabsContent>

              <TabsContent value="trades" className="mt-0">
                {traderPositionsOpen.length > 0 ? (
                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground mb-2">
                      Active
                    </h3>
                    <TraderPositionsTable
                      positions={traderPositionsOpen}
                      context="profile"
                    />
                  </div>
                ) : null}
                {traderPositionsClosed.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="font-medium text-sm text-muted-foreground mb-2">
                      Closed
                    </h3>
                    <ClosedTraderPositionsTable
                      positions={traderPositionsClosed}
                    />
                  </div>
                ) : null}
                {traderPositionsOpen.length === 0 &&
                traderPositionsClosed.length === 0 ? (
                  <EmptyTabState message="No trades found" />
                ) : null}
              </TabsContent>

              <TabsContent value="lp" className="mt-0">
                <LpPositionsTable positions={lpPositions} context="profile" />
              </TabsContent>

              <TabsContent value="forecasts" className="mt-0">
                <ForecastsTable attestations={attestations} />
              </TabsContent>
            </Tabs>
          </div>
        )
      ) : (
        <div className="flex justify-center py-24">
          <LottieLoader width={32} height={32} />
        </div>
      )}
    </div>
  );
};

export default ProfilePageContent;
