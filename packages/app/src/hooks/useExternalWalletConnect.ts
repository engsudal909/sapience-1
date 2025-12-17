'use client';

import { useCallback, useState } from 'react';
import { useConnect } from 'wagmi';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';
import { toast } from '@sapience/ui/hooks/use-toast';
import type { EIP6963ProviderDetail } from './useWalletDiscovery';

/** Identifiers for tracking which wallet is currently connecting */
export type ConnectingWalletId = string | null;

interface UseExternalWalletConnectResult {
  /** Which wallet is currently connecting (null if none) */
  connectingWallet: ConnectingWalletId;
  /** Convenience boolean - true if any wallet is connecting */
  isConnecting: boolean;
  /** Connect via an EIP-6963 discovered browser wallet */
  connectEIP6963Wallet: (wallet: EIP6963ProviderDetail) => Promise<void>;
  /** Connect via WalletConnect */
  connectWalletConnect: () => Promise<void>;
  /** Connect via Coinbase Wallet */
  connectCoinbaseWallet: () => Promise<void>;
  /** Connect via OKX Wallet */
  connectOKXWallet: () => Promise<void>;
}

/**
 * Check if an error is a user rejection (user cancelled the connection)
 */
function isUserRejection(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('rejected') ||
    msg.includes('cancelled') ||
    msg.includes('denied') ||
    msg.includes('user closed')
  );
}

/**
 * Hook to handle direct wallet connections outside of Privy's modal.
 * Supports EIP-6963 discovered wallets, WalletConnect, and Coinbase Wallet.
 */
export function useExternalWalletConnect(): UseExternalWalletConnectResult {
  const [connectingWallet, setConnectingWallet] =
    useState<ConnectingWalletId>(null);

  const { connectAsync } = useConnect();

  /**
   * Handle connection errors - shows toast for non-rejection errors
   */
  const handleConnectError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      if (!isUserRejection(err)) {
        const message = err instanceof Error ? err.message : fallbackMessage;
        toast({
          title: 'Connection Failed',
          description: message,
          variant: 'destructive',
        });
      }
    },
    []
  );

  // Connect via EIP-6963 discovered provider using wagmi's injected connector
  const connectEIP6963Wallet = useCallback(
    async (wallet: EIP6963ProviderDetail) => {
      setConnectingWallet(wallet.info.rdns);

      try {
        // Create a targeted injected connector for this specific wallet
        // This is the correct pattern for EIP-6963 wallets
        const connector = injected({
          target: {
            id: wallet.info.rdns,
            name: wallet.info.name,
            provider: wallet.provider,
          },
        });

        await connectAsync({ connector });
      } catch (err) {
        handleConnectError(err, 'Failed to connect wallet');
      } finally {
        setConnectingWallet(null);
      }
    },
    [connectAsync, handleConnectError]
  );

  // Connect via WalletConnect
  const connectWalletConnect = useCallback(async () => {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

    if (!projectId) {
      toast({
        title: 'WalletConnect Error',
        description:
          'WalletConnect project ID not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.',
        variant: 'destructive',
      });
      return;
    }

    setConnectingWallet('walletconnect');

    try {
      const connector = walletConnect({
        projectId,
        showQrModal: true,
      });

      await connectAsync({ connector });
    } catch (err) {
      handleConnectError(err, 'Failed to connect via WalletConnect');
    } finally {
      setConnectingWallet(null);
    }
  }, [connectAsync, handleConnectError]);

  // Connect via Coinbase Wallet
  const connectCoinbaseWallet = useCallback(async () => {
    setConnectingWallet('coinbase');

    try {
      const connector = coinbaseWallet({
        appName: 'Sapience',
      });

      await connectAsync({ connector });
    } catch (err) {
      handleConnectError(err, 'Failed to connect Coinbase Wallet');
    } finally {
      setConnectingWallet(null);
    }
  }, [connectAsync, handleConnectError]);

  // Connect via OKX Wallet (or fallback to default injected wallet like Rabby)
  const connectOKXWallet = useCallback(async () => {
    setConnectingWallet('okx');

    try {
      // Check for OKX-specific provider
      const okxProvider = (window as unknown as { okxwallet?: unknown })
        .okxwallet;

      let connector;

      if (okxProvider) {
        // OKX is installed - use it directly
        connector = injected({
          target: {
            id: 'com.okex.wallet',
            name: 'OKX Wallet',
            provider: okxProvider as NonNullable<
              Parameters<typeof injected>[0]
            >['target'] extends { provider: infer P }
              ? P
              : never,
          },
        });
      } else {
        // OKX not installed - use generic injected (Rabby/MetaMask will handle it)
        connector = injected();
      }

      await connectAsync({ connector });
    } catch (err) {
      handleConnectError(err, 'Failed to connect OKX Wallet');
    } finally {
      setConnectingWallet(null);
    }
  }, [connectAsync, handleConnectError]);

  return {
    connectingWallet,
    isConnecting: connectingWallet !== null,
    connectEIP6963Wallet,
    connectWalletConnect,
    connectCoinbaseWallet,
    connectOKXWallet,
  };
}
