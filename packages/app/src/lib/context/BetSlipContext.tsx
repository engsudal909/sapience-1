'use client';

import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';

// localStorage key for parlay selections persistence
const STORAGE_KEY_PARLAYS = 'sapience:betslip-parlays';

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}
import type { MarketGroup as MarketGroupType } from '@sapience/sdk/types/graphql';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { createPositionDefaults } from '~/lib/utils/betslipUtils';

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
  categorySlug?: string | null; // category slug for icon display
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
    () => loadFromStorage(STORAGE_KEY_PARLAYS, [])
  );
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Persist parlay selections to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PARLAYS, JSON.stringify(parlaySelections));
  }, [parlaySelections]);

  // Spot market functionality removed - positionsWithMarketData is empty
  const positionsWithMarketData: PositionWithMarketData[] = singlePositions.map(
    (position) => ({
      position,
      marketGroupData: undefined,
      marketClassification: position.marketClassification,
      isLoading: false,
      error: null,
    })
  );

  const addPosition = useCallback(
    (position: Omit<BetSlipPosition, 'id'>) => {
      // Create intelligent defaults based on market classification
      const defaults = createPositionDefaults(position.marketClassification);

      // Special handling for YES/NO: treat the question as a single logical position
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
                    prediction: position.prediction,
                    marketId: position.marketId,
                    question: position.question,
                    marketClassification: position.marketClassification,
                    wagerAmount: p.wagerAmount || defaults.wagerAmount,
                  }
                : p
            )
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
        setSinglePositions((prev) =>
          prev.map((p, index) =>
            index === existingPositionIndex
              ? {
                  ...p,
                  prediction: position.prediction,
                  question: position.question,
                  marketClassification: position.marketClassification,
                  wagerAmount: p.wagerAmount || defaults.wagerAmount,
                }
              : p
          )
        );
      } else {
        const id = `${position.marketAddress}-${position.marketId}-${position.prediction}-${Date.now()}`;
        const enhancedPosition: BetSlipPosition = {
          ...position,
          id,
          wagerAmount: position.wagerAmount || defaults.wagerAmount,
          prediction: position.prediction ?? defaults.prediction ?? false,
        };
        setSinglePositions((prev) => [...prev, enhancedPosition]);
      }

      setIsPopoverOpen(true);
    },
    [singlePositions]
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
