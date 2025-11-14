'use client';

import type React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MarketGroup as MarketGroupType } from '@sapience/sdk/types/graphql';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { createPositionDefaults } from '~/lib/utils/betslipUtils';
import {
  prefetchMarketGroup,
  normalizeMarketIdentifier,
  useMarketGroupsForPositions,
} from '~/hooks/graphql/useMarketGroup';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';

// Updated BetSlipPosition type based on requirements
export interface BetSlipPosition {
  id: string;
  prediction: boolean;
  marketAddress: string;
  marketId: number;
  question: string;
  chainId: number; // Add chainId to identify which chain the market is on
  wagerAmount?: string; // Store default wager amount
  marketClassification?: MarketGroupClassification; // Store classification for better form handling
}

// Lightweight parlay selection for OTC conditions (no on-chain market data)
export interface ParlaySelection {
  id: string; // unique within betslip
  conditionId: string;
  question: string;
  prediction: boolean; // true = yes, false = no
}

// Interface for market data with position
export interface PositionWithMarketData {
  position: BetSlipPosition;
  marketGroupData: MarketGroupType | undefined;
  marketClassification: MarketGroupClassification | undefined;
  isLoading: boolean;
  error: boolean | null;
}

interface BetSlipContextType {
  // Separate lists: single positions (on-chain) and parlay selections (RFQ conditions)
  betSlipPositions: BetSlipPosition[]; // legacy alias to singlePositions for backward compat
  singlePositions: BetSlipPosition[];
  parlaySelections: ParlaySelection[];
  addPosition: (position: Omit<BetSlipPosition, 'id'>) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<BetSlipPosition>) => void;
  clearBetSlip: () => void;
  // Parlay selections API
  addParlaySelection: (selection: Omit<ParlaySelection, 'id'>) => void;
  removeParlaySelection: (id: string) => void;
  clearParlaySelections: () => void;
  openPopover: () => void;
  isPopoverOpen: boolean;
  setIsPopoverOpen: (open: boolean) => void;
  // New properties for market data
  positionsWithMarketData: PositionWithMarketData[];
}

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

export const useBetSlipContext = () => {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error('useBetSlipContext must be used within a BetSlipProvider');
  }
  return context;
};

interface BetSlipProviderProps {
  children: React.ReactNode;
}

export const BetSlipProvider = ({ children }: BetSlipProviderProps) => {
  const [singlePositions, setSinglePositions] = useState<BetSlipPosition[]>([]);
  const [parlaySelections, setParlaySelections] = useState<ParlaySelection[]>(
    []
  );
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const queryClient = useQueryClient();
  // Removed manual cache subscription; useQueries handles re-renders

  // Hydrate market data for all positions via React Query and map back to positions
  const { unique, queries } = useMarketGroupsForPositions(singlePositions);

  // Build a lookup from normalizedId:chainId -> query result
  const resultLookup = (() => {
    const map = new Map<
      string,
      {
        data: MarketGroupType | undefined;
        isLoading: boolean;
        isError: boolean;
      }
    >();
    unique.forEach((u, idx) => {
      const q = queries[idx];
      const key = `${u.id}:${u.chainId}`;
      map.set(key, {
        data: (q as any)?.data as MarketGroupType | undefined,
        isLoading: (q as any)?.isLoading ?? false,
        isError: (q as any)?.isError ?? false,
      });
    });
    return map;
  })();

  const positionsWithMarketData = singlePositions.map((position) => {
    const effectiveChainId = position.chainId || 8453;
    const normalizedIdentifier = normalizeMarketIdentifier(
      position.marketAddress
    );
    const key = `${normalizedIdentifier}:${effectiveChainId}`;
    const entry = resultLookup.get(key);
    const marketGroupData = entry?.data;
    const isLoading = entry?.isLoading ?? false;
    const isError = entry?.isError ?? false;

    const computedClassification = marketGroupData
      ? getMarketGroupClassification(marketGroupData)
      : undefined;
    const marketClassification =
      position.marketClassification ?? computedClassification;

    return {
      position: {
        ...position,
        chainId: effectiveChainId,
      },
      marketGroupData,
      marketClassification,
      isLoading,
      error: isError,
    };
  });

  const addPosition = useCallback(
    (position: Omit<BetSlipPosition, 'id'>) => {
      // Create intelligent defaults based on market classification
      const defaults = createPositionDefaults(position.marketClassification);

      // Special handling for YES/NO: treat the question as a single logical position
      // and update existing entry for the same market address regardless of marketId
      if (
        position.marketClassification === MarketGroupClassificationEnum.YES_NO
      ) {
        const existingYesNoIndex = singlePositions.findIndex(
          (p) =>
            p.marketAddress === position.marketAddress &&
            p.marketClassification === MarketGroupClassificationEnum.YES_NO
        );

        if (existingYesNoIndex !== -1) {
          setSinglePositions((prev) =>
            prev.map((p, index) =>
              index === existingYesNoIndex
                ? {
                    ...p,
                    // Switch to the newly selected side and marketId
                    prediction: position.prediction,
                    marketId: position.marketId,
                    question: position.question,
                    marketClassification: position.marketClassification,
                    wagerAmount: p.wagerAmount || defaults.wagerAmount,
                  }
                : p
            )
          );

          const effectiveChainId = position.chainId || 8453;
          void prefetchMarketGroup(
            queryClient,
            effectiveChainId,
            position.marketAddress
          );

          setIsPopoverOpen(true);
          return;
        }
      }

      // Check if a position with the same marketAddress and marketId already exists
      const existingPositionIndex = singlePositions.findIndex(
        (p) =>
          p.marketAddress === position.marketAddress &&
          p.marketId === position.marketId
      );

      if (existingPositionIndex !== -1) {
        // Merge into existing position by updating it
        setSinglePositions((prev) =>
          prev.map((p, index) =>
            index === existingPositionIndex
              ? {
                  ...p,
                  prediction: position.prediction,
                  question: position.question,
                  marketClassification: position.marketClassification,
                  // Preserve existing wager amount if it exists, otherwise use default
                  wagerAmount: p.wagerAmount || defaults.wagerAmount,
                }
              : p
          )
        );

        const effectiveChainId = position.chainId || 8453;
        void prefetchMarketGroup(
          queryClient,
          effectiveChainId,
          position.marketAddress
        );
      } else {
        // Generate a unique ID for the new position
        const id = `${position.marketAddress}-${position.marketId}-${position.prediction}-${Date.now()}`;

        // Apply intelligent defaults for new positions
        const enhancedPosition: BetSlipPosition = {
          ...position,
          id,
          // Apply defaults while allowing explicit overrides
          wagerAmount: position.wagerAmount || defaults.wagerAmount,
          prediction: position.prediction ?? defaults.prediction ?? false,
        };

        // Prefetch market data before adding, so collateral is known on first render
        const effectiveChainId = position.chainId || 8453;
        void prefetchMarketGroup(
          queryClient,
          effectiveChainId,
          position.marketAddress
        ).then(() => {
          setSinglePositions((prev) => [...prev, enhancedPosition]);
          setIsPopoverOpen(true);
        });
        return;
      }

      setIsPopoverOpen(true); // Open popover when position is added or updated
    },
    [singlePositions, queryClient]
  );

  const removePosition = useCallback(
    (id: string) => {
      const newPositions = singlePositions.filter((p) => p.id !== id);
      setSinglePositions(newPositions);
    },
    [singlePositions]
  );

  const updatePosition = useCallback(
    (id: string, updates: Partial<BetSlipPosition>) => {
      setSinglePositions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const clearBetSlip = useCallback(() => {
    setSinglePositions([]);
  }, []);

  const openPopover = useCallback(() => {
    setIsPopoverOpen(true);
  }, []);

  const addParlaySelection = useCallback(
    (selection: Omit<ParlaySelection, 'id'>) => {
      setParlaySelections((prev) => {
        const existingIndex = prev.findIndex(
          (s) => s.conditionId === selection.conditionId
        );

        if (existingIndex !== -1) {
          // Update the existing leg's prediction while preserving id and question
          return prev.map((s, i) =>
            i === existingIndex ? { ...s, prediction: selection.prediction } : s
          );
        }

        const id = `${selection.conditionId}-${selection.prediction}-${Date.now()}`;
        return [...prev, { ...selection, id }];
      });
      setIsPopoverOpen(true);
    },
    []
  );

  const removeParlaySelection = useCallback((id: string) => {
    setParlaySelections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearParlaySelections = useCallback(() => {
    setParlaySelections([]);
  }, []);

  const value: BetSlipContextType = {
    // Keep legacy alias for compatibility
    betSlipPositions: singlePositions,
    singlePositions,
    parlaySelections,
    addPosition,
    removePosition,
    updatePosition,
    clearBetSlip,
    addParlaySelection,
    removeParlaySelection,
    clearParlaySelections,
    openPopover,
    isPopoverOpen,
    setIsPopoverOpen,
    positionsWithMarketData,
  };

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
};
