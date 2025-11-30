'use client';

import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useWallets, usePrivy } from '@privy-io/react-auth';

export type WalletType = 'embedded' | 'external' | 'unknown';

export interface ActiveWalletInfo {
  /** The connected wallet address */
  address: `0x${string}` | undefined;
  /** Whether a wallet is connected */
  isConnected: boolean;
  /** Whether the user is authenticated with Privy */
  isAuthenticated: boolean;
  /** Whether the Privy SDK is ready */
  isReady: boolean;
  /** Type of wallet: 'embedded' (Privy) or 'external' (browser/WalletConnect) */
  walletType: WalletType;
  /** Display name for the wallet (e.g., "Privy", "MetaMask", "WalletConnect") */
  walletName: string | undefined;
  /** The raw Privy wallet object if available */
  privyWallet: ReturnType<typeof useWallets>['wallets'][number] | undefined;
  /** The wagmi connector name */
  connectorName: string | undefined;
}

/**
 * Unified hook for wallet state regardless of how the wallet was connected.
 * Provides a consistent interface for both Privy embedded wallets and
 * external browser wallets.
 */
export function useActiveWallet(): ActiveWalletInfo {
  const { address, isConnected, connector } = useAccount();
  const { wallets } = useWallets();
  const { authenticated, ready } = usePrivy();

  return useMemo(() => {
    // Find the active wallet in Privy's list
    const activePrivyWallet = wallets.find(
      (w) => w.address.toLowerCase() === address?.toLowerCase()
    );

    // Determine wallet type based on Privy wallet client type
    let walletType: WalletType = 'unknown';
    if (activePrivyWallet) {
      walletType =
        activePrivyWallet.walletClientType === 'privy'
          ? 'embedded'
          : 'external';
    } else if (isConnected && connector) {
      // Connected via wagmi directly without Privy
      walletType = 'external';
    }

    // Get a display name for the wallet
    let walletName: string | undefined;
    if (activePrivyWallet?.walletClientType === 'privy') {
      walletName = 'Privy';
    } else if (activePrivyWallet?.walletClientType) {
      // Capitalize first letter of wallet client type
      const clientType = activePrivyWallet.walletClientType;
      walletName = clientType.charAt(0).toUpperCase() + clientType.slice(1);
    } else if (connector?.name) {
      walletName = connector.name;
    }

    return {
      address,
      isConnected,
      isAuthenticated: authenticated,
      isReady: ready,
      walletType,
      walletName,
      privyWallet: activePrivyWallet,
      connectorName: connector?.name,
    };
  }, [address, isConnected, authenticated, ready, wallets, connector]);
}


