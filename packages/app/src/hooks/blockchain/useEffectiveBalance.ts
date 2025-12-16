'use client';

import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useCollateralBalance } from './useCollateralBalance';
import { useChainIdFromLocalStorage } from './useChainIdFromLocalStorage';
import { useUserPositions } from '~/hooks/graphql/usePositions';

/** Threshold below which we consider the balance "low" */
const LOW_BALANCE_THRESHOLD = 1; // USDe

export interface UseEffectiveBalanceResult {
  /** Wallet balance (after gas reserve) */
  walletBalance: number;
  /** Total margin locked in open positions */
  totalMargin: number;
  /** Effective balance = wallet balance - total margin */
  effectiveBalance: number;
  /** Whether the balance is considered low */
  isLowBalance: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Whether the user is connected */
  isConnected: boolean;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Hook to calculate effective balance (wallet balance - margin locked in positions)
 * Returns low balance warning when effective balance is zero or negative
 */
export function useEffectiveBalance(): UseEffectiveBalanceResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainIdFromLocalStorage();

  // Get wallet balance
  const {
    balance: walletBalance,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useCollateralBalance({
    address: address,
    chainId,
    enabled: isConnected && !!address,
  });

  // Get user positions across all markets
  const {
    data: positions,
    isLoading: isLoadingPositions,
    refetch: refetchPositions,
  } = useUserPositions({
    address: address ?? '',
  });

  // Calculate total margin from open positions
  const totalMargin = useMemo(() => {
    if (!positions || positions.length === 0) return 0;

    let total = 0;
    for (const position of positions) {
      // Skip settled positions
      if (position.isSettled) continue;

      // Get collateral decimals (default to 18)
      const decimals = position.market?.marketGroup?.collateralDecimals ?? 18;

      // Parse collateral amount
      if (position.collateral) {
        try {
          const collateralBigInt = BigInt(position.collateral);
          // Skip positions with zero or negative collateral
          if (collateralBigInt <= 0n) continue;
          const collateralValue = Number(
            formatUnits(collateralBigInt, decimals)
          );
          if (Number.isFinite(collateralValue) && collateralValue > 0) {
            total += collateralValue;
          }
        } catch {
          // Skip invalid collateral values
        }
      }
    }
    return total;
  }, [positions]);

  // Calculate effective balance
  const effectiveBalance = walletBalance - totalMargin;
  // Show low balance warning if:
  // 1. Wallet balance is below threshold (very low funds), OR
  // 2. Effective balance is zero/negative when user has positions
  const isLowBalance =
    isConnected &&
    (walletBalance < LOW_BALANCE_THRESHOLD ||
      (effectiveBalance <= 0 && totalMargin > 0));

  const isLoading = isLoadingBalance || isLoadingPositions;

  const refetch = () => {
    refetchBalance();
    refetchPositions();
  };

  return {
    walletBalance,
    totalMargin,
    effectiveBalance,
    isLowBalance,
    isLoading,
    isConnected,
    refetch,
  };
}
