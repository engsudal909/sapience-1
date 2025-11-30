'use client';

import { useState, useEffect } from 'react';
import type { EIP1193Provider } from 'viem';

// EIP-6963 types
export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string; // data URL (e.g., "data:image/svg+xml,...")
  rdns: string; // Reverse DNS (e.g., "io.rabby", "io.metamask")
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

interface EIP6963AnnounceProviderEvent extends CustomEvent {
  detail: EIP6963ProviderDetail;
}

// Declare the global event types for TypeScript
declare global {
  interface WindowEventMap {
    'eip6963:announceProvider': EIP6963AnnounceProviderEvent;
    'eip6963:requestProvider': Event;
  }
}

interface UseWalletDiscoveryResult {
  discoveredWallets: EIP6963ProviderDetail[];
  isDiscovering: boolean;
}

/**
 * Hook to discover installed browser wallets using the EIP-6963 standard.
 * This dispatches a request for providers and listens for wallet announcements.
 */
export function useWalletDiscovery(): UseWalletDiscoveryResult {
  const [discoveredWallets, setDiscoveredWallets] = useState<
    EIP6963ProviderDetail[]
  >([]);
  const [isDiscovering, setIsDiscovering] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsDiscovering(false);
      return;
    }

    const wallets: EIP6963ProviderDetail[] = [];

    const handleAnnouncement = (event: EIP6963AnnounceProviderEvent) => {
      const { info, provider } = event.detail;

      // Avoid duplicates by checking rdns
      if (!wallets.some((w) => w.info.rdns === info.rdns)) {
        wallets.push({ info, provider });
        setDiscoveredWallets([...wallets]);
      }
    };

    // Listen for wallet announcements
    window.addEventListener('eip6963:announceProvider', handleAnnouncement);

    // Request providers to announce themselves
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Give wallets time to respond (most respond within 100ms)
    const timeout = setTimeout(() => setIsDiscovering(false), 500);

    return () => {
      window.removeEventListener(
        'eip6963:announceProvider',
        handleAnnouncement
      );
      clearTimeout(timeout);
    };
  }, []);

  return { discoveredWallets, isDiscovering };
}


