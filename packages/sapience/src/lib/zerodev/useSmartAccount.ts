'use client';

/**
 * ZeroDev Smart Account Hook
 *
 * Creates and manages a Kernel smart account from the user's EOA wallet.
 * This enables session key functionality for automatic bid signing.
 * 
 * NOTE: This is a placeholder implementation. The full ZeroDev integration
 * requires the following packages to be installed:
 * - @zerodev/sdk
 * - @zerodev/ecdsa-validator
 * - @zerodev/permissions
 * - permissionless
 * 
 * Until those packages are installed, this hook returns a disabled state
 * and the app falls back to local session key mode.
 */

import { useCallback, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import {
  isZeroDevSupported,
  ZERODEV_PROJECT_ID,
} from './config';

interface SmartAccountState {
  /** Whether the smart account is ready */
  isReady: boolean;
  /** Whether ZeroDev is supported on the current chain */
  isSupported: boolean;
  /** The smart account address */
  smartAccountAddress: Address | null;
  /** Whether a valid session exists */
  hasValidSession: boolean;
  /** Session expiry timestamp */
  sessionExpiresAt: number | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
}

interface SmartAccountActions {
  /** Create a new session key with permissions */
  createSession: (durationHours: number) => Promise<{ success: boolean; error?: string }>;
  /** Revoke the current session */
  revokeSession: () => void;
  /** Get the session account client for signing */
  getSessionClient: () => Promise<unknown | null>;
  /** Refresh session state from storage */
  refreshSession: () => void;
}

export type UseSmartAccountResult = SmartAccountState & SmartAccountActions;

/**
 * Placeholder hook for ZeroDev smart account integration.
 * 
 * Returns disabled state until ZeroDev packages are installed.
 * The SessionKeyContext will fall back to local session key mode.
 */
export function useSmartAccount(): UseSmartAccountResult {
  const chainId = useChainIdFromLocalStorage();
  const [error] = useState<string | null>(
    ZERODEV_PROJECT_ID ? null : 'ZeroDev project ID not configured'
  );

  // Check if ZeroDev is supported for current chain
  const isSupported = useMemo(() => {
    if (!ZERODEV_PROJECT_ID) return false;
    return isZeroDevSupported(chainId);
  }, [chainId]);

  // Placeholder: always returns not ready until packages are installed
  const state: SmartAccountState = {
    isReady: false,
    isSupported,
    smartAccountAddress: null,
    hasValidSession: false,
    sessionExpiresAt: null,
    isLoading: false,
    error: isSupported ? 'ZeroDev packages not installed. Install @zerodev/sdk to enable smart account mode.' : error,
  };

  const createSession = useCallback(
    async (_durationHours: number): Promise<{ success: boolean; error?: string }> => {
      return {
        success: false,
        error: 'ZeroDev packages not installed. Please run: pnpm add @zerodev/sdk @zerodev/ecdsa-validator @zerodev/permissions permissionless',
      };
    },
    []
  );

  const revokeSession = useCallback(() => {
    // No-op in placeholder mode
  }, []);

  const getSessionClient = useCallback(async () => {
    return null;
  }, []);

  const refreshSession = useCallback(() => {
    // No-op in placeholder mode
  }, []);

  return {
    ...state,
    createSession,
    revokeSession,
    getSessionClient,
    refreshSession,
  };
}
