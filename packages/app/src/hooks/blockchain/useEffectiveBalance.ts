'use client';

import { useAccount } from 'wagmi';
import { useCollateralBalance } from './useCollateralBalance';
import { useChainIdFromLocalStorage } from './useChainIdFromLocalStorage';

export interface UseEffectiveBalanceResult {
  /** Effective balance (wUSDe + native USDe - gas reserve) */
  effectiveBalance: number;
  /** Whether the effective balance is zero or negative */
  isLowBalance: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Whether the user is connected */
  isConnected: boolean;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Hook to get effective balance and low balance status.
 * Effective balance = wUSDe + native USDe - gas reserve (50 cents)
 * Shows low balance warning when effective balance is zero or negative.
 */
export function useEffectiveBalance(): UseEffectiveBalanceResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainIdFromLocalStorage();

  const {
    balance: effectiveBalance,
    isLoading,
    refetch,
  } = useCollateralBalance({
    address: address,
    chainId,
    enabled: isConnected && !!address,
  });

  return {
    effectiveBalance,
    isLowBalance: isConnected && effectiveBalance <= 0,
    isLoading,
    isConnected,
    refetch,
  };
}
