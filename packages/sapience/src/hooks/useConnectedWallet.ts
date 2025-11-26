'use client';

import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useMemo } from 'react';

export interface ConnectedWalletState {
  ready: boolean;
  connectedWallet:
    | ReturnType<typeof useWallets>['wallets'][number]
    | { address: `0x${string}` }
    | undefined;
  hasConnectedWallet: boolean;
}

/**
 * Unified hook to detect wallet connection from either Privy or wagmi.
 * Prioritizes Privy wallets but falls back to wagmi for direct external connections.
 */
export function useConnectedWallet(): ConnectedWalletState {
  const { wallets } = useWallets();
  const { ready: privyReady } = usePrivy();
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();

  // Privy wallet takes priority
  const privyWallet = useMemo(() => wallets?.[0], [wallets]);

  // Use Privy wallet if available, otherwise use wagmi connection
  const connectedWallet = useMemo(() => {
    if (privyWallet?.address) {
      return privyWallet;
    }
    // Fallback to wagmi for direct external wallet connections
    if (wagmiConnected && wagmiAddress) {
      return { address: wagmiAddress };
    }
    return undefined;
  }, [privyWallet, wagmiConnected, wagmiAddress]);

  const hasConnectedWallet = Boolean(privyReady && connectedWallet?.address);

  return { ready: privyReady, connectedWallet, hasConnectedWallet };
}
