'use client';

/**
 * Session Key Context
 *
 * Provides session key management for automated transaction/bid signing.
 * When a session is active, operations can be signed automatically
 * without prompting the user for each signature.
 *
 * ## Architecture:
 *
 * ### ZeroDev Mode (Recommended)
 * When NEXT_PUBLIC_ZERODEV_PROJECT_ID is configured and the chain is supported:
 * - Uses ZeroDev Kernel smart accounts
 * - Session keys are registered as permission validators
 * - Signatures are ERC-1271 compatible (work with smart contracts)
 * - Full on-chain security with permission scoping
 *
 * ### Local Mode (Fallback)
 * When ZeroDev is not available:
 * - Generates ephemeral keys stored in localStorage
 * - Collects authorization signature from wallet (for audit trail)
 * - NOTE: These signatures won't work with on-chain verification
 * - Useful for testing or UI development only
 *
 * ## Usage:
 * ```tsx
 * const { hasValidSession, createSession } = useSessionKey();
 *
 * // Create a session
 * await createSession();
 *
 * // Check if should use session signing
 * const shouldUse = useShouldUseSessionKey();
 * ```
 */

import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex, LocalAccount, Address, TypedDataDomain } from 'viem';
import { useSignTypedData } from 'wagmi';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import {
  useSmartAccount,
  type SmartAccountClient,
} from '~/lib/zerodev/useSmartAccount';
import { isZeroDevSupported, ZERODEV_PROJECT_ID } from '~/lib/zerodev/config';

// Storage keys for session data
const SESSION_STORAGE_KEY = 'sapience.session.keys';
const SESSION_MODE_STORAGE_KEY = 'sapience.settings.sessionMode';
const SESSION_LENGTH_STORAGE_KEY = 'sapience.settings.sessionLengthHours';

/**
 * Stored session key data for local mode (per chain, per wallet)
 */
interface StoredLocalSessionData {
  /** The session private key (hex) */
  privateKey: Hex;
  /** Session expiry timestamp (ms since epoch) */
  expiresAt: number;
  /** The wallet address that authorized this session */
  authorizedBy: string;
  /** Chain ID this session is valid for */
  chainId: number;
  /** Session creation timestamp */
  createdAt: number;
  /** The session key's public address */
  sessionAddress: string;
  /** Authorization signature from the wallet owner */
  authorizationSignature: Hex;
}

interface SessionKeyState {
  /** Whether a valid session exists for current wallet/chain */
  hasValidSession: boolean;
  /** The session key account if available (local mode only) */
  sessionAccount: LocalAccount | null;
  /** Session expiry time */
  expiresAt: number | null;
  /** Whether session mode is "periodically" (vs "every") */
  isSessionModeEnabled: boolean;
  /** Configured session duration in hours */
  sessionDurationHours: number;
  /** Whether using ZeroDev smart account (true) or local fallback (false) */
  isZeroDevMode: boolean;
  /** Smart account address when using ZeroDev */
  smartAccountAddress: Address | null;
  /** Whether ZeroDev is supported on current chain */
  isZeroDevSupported: boolean;
  /** Whether session creation is in progress */
  isCreating: boolean;
  /** Error message if any */
  error: string | null;
}

interface SessionKeyContextValue extends SessionKeyState {
  /** Create a new session key for the current wallet/chain */
  createSession: () => Promise<{ success: boolean; error?: string }>;
  /** Revoke the current session */
  revokeSession: () => void;
  /** Check if a session is valid and not expired */
  isSessionValid: () => boolean;
  /** Get the session signer for signing operations (local mode) */
  getSessionSigner: () => LocalAccount | null;
  /** Get the ZeroDev session client for signing (smart account mode) */
  getZeroDevSessionClient: () => Promise<SmartAccountClient | null>;
  /** Get the ZeroDev session client for a specific chain */
  getZeroDevSessionClientForChain: (chainId: number) => Promise<SmartAccountClient | null>;
  /** Sign typed data using the session key (works in both modes) */
  signTypedDataWithSession: (params: {
    domain: TypedDataDomain;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex | null>;
  /** Refresh session state from storage, optionally for a specific chain */
  refreshSession: (forChainId?: number) => void;
  /** Whether Arbitrum session is valid (for forecasting from any chain) */
  hasValidArbitrumSession: boolean;
  /** Arbitrum session expiry */
  arbitrumSessionExpiresAt: number | null;
}

const SessionKeyContext = createContext<SessionKeyContextValue | undefined>(
  undefined
);

/**
 * Generate a storage key for a specific wallet and chain
 */
function getStorageKey(address: string, chainId: number): string {
  return `${address.toLowerCase()}-${chainId}`;
}

/**
 * Load all stored local sessions from localStorage
 */
function loadStoredSessions(): Record<string, StoredLocalSessionData> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredLocalSessionData>;
  } catch {
    return {};
  }
}

/**
 * Save sessions to localStorage
 */
function saveStoredSessions(
  sessions: Record<string, StoredLocalSessionData>
): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage may be full or disabled
  }
}

/**
 * Load session mode setting
 */
function loadSessionMode(): 'every' | 'periodically' {
  try {
    if (typeof window === 'undefined') return 'periodically';
    const mode = window.localStorage.getItem(SESSION_MODE_STORAGE_KEY);
    if (mode === 'every' || mode === 'periodically') return mode;
    return 'periodically';
  } catch {
    return 'periodically';
  }
}

/**
 * Load session duration setting
 */
function loadSessionDuration(): number {
  try {
    if (typeof window === 'undefined') return 24;
    const hours = window.localStorage.getItem(SESSION_LENGTH_STORAGE_KEY);
    if (hours) {
      const parsed = parseInt(hours, 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return 24;
  } catch {
    return 24;
  }
}

export const SessionKeyProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Wallet connection
  const { connectedWallet, hasConnectedWallet } = useConnectedWallet();
  const address = connectedWallet?.address;
  const chainId = useChainIdFromLocalStorage();
  const { signTypedDataAsync } = useSignTypedData();

  // ZeroDev smart account integration
  const smartAccount = useSmartAccount();

  // Local state
  const [mounted, setMounted] = useState(false);
  const [localSessionData, setLocalSessionData] =
    useState<StoredLocalSessionData | null>(null);
  const [sessionMode, setSessionMode] = useState<'every' | 'periodically'>(
    'periodically'
  );
  const [sessionDurationHours, setSessionDurationHours] = useState(24);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine if we should use ZeroDev
  const useZeroDevMode = useMemo(() => {
    return Boolean(ZERODEV_PROJECT_ID) && isZeroDevSupported(chainId);
  }, [chainId]);

  // Mount detection
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load session mode and duration from localStorage
  useEffect(() => {
    if (!mounted) return;
    setSessionMode(loadSessionMode());
    setSessionDurationHours(loadSessionDuration());

    // Listen for storage changes (from settings page)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SESSION_MODE_STORAGE_KEY) {
        const mode = e.newValue;
        if (mode === 'every' || mode === 'periodically') {
          setSessionMode(mode);
        }
      } else if (e.key === SESSION_LENGTH_STORAGE_KEY) {
        const hours = e.newValue;
        if (hours) {
          const parsed = parseInt(hours, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            setSessionDurationHours(parsed);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [mounted]);

  // Load local session data for current wallet/chain
  const refreshLocalSession = useCallback(() => {
    if (!mounted || !hasConnectedWallet || !address || !chainId) {
      setLocalSessionData(null);
      return;
    }

    const sessions = loadStoredSessions();
    const key = getStorageKey(address, chainId);
    const stored = sessions[key];

    if (stored) {
      // Check if session is expired
      if (stored.expiresAt > Date.now()) {
        setLocalSessionData(stored);
      } else {
        // Clean up expired session
        delete sessions[key];
        saveStoredSessions(sessions);
        setLocalSessionData(null);
      }
    } else {
      setLocalSessionData(null);
    }
  }, [mounted, address, chainId, hasConnectedWallet]);

  // Refresh session when wallet/chain changes
  // Optionally accepts a chainId to refresh for a specific chain
  const refreshSession = useCallback((forChainId?: number) => {
    if (useZeroDevMode) {
      smartAccount.refreshSession(forChainId);
    } else {
      refreshLocalSession();
    }
  }, [useZeroDevMode, smartAccount, refreshLocalSession]);

  // Load session on mount and when dependencies change
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Periodically check for session expiry
  useEffect(() => {
    const sessionData = useZeroDevMode ? null : localSessionData;
    const expiresAt = useZeroDevMode
      ? smartAccount.sessionExpiresAt
      : sessionData?.expiresAt;

    if (!expiresAt) return;

    const checkExpiry = () => {
      if (expiresAt <= Date.now()) {
        refreshSession();
      }
    };

    // Check every minute
    const interval = setInterval(checkExpiry, 60_000);
    return () => clearInterval(interval);
  }, [
    localSessionData,
    smartAccount.sessionExpiresAt,
    useZeroDevMode,
    refreshSession,
  ]);

  // Create a new session
  const createSession = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!hasConnectedWallet || !address) {
      return { success: false, error: 'Wallet not connected' };
    }
    if (!chainId) {
      return { success: false, error: 'Chain not selected' };
    }

    setIsCreating(true);
    setError(null);

    try {
      if (useZeroDevMode) {
        // Use ZeroDev for session creation
        const result = await smartAccount.createSession(sessionDurationHours);
        if (!result.success) {
          setError(result.error || 'Failed to create ZeroDev session');
        }
        return result;
      } else {
        // Local fallback mode
        // Generate a new ephemeral private key for the session
        const privateKey = generatePrivateKey();
        const sessionAccount = privateKeyToAccount(privateKey);
        const sessionAddress = sessionAccount.address;

        // Calculate expiry based on settings
        const expiresAt = Date.now() + sessionDurationHours * 60 * 60 * 1000;
        const createdAt = Date.now();

        // EIP-712 typed data for session authorization
        const domain = {
          name: 'Sapience Session',
          version: '1',
          chainId: chainId,
        } as const;

        const types = {
          SessionAuthorization: [
            { name: 'sessionKey', type: 'address' },
            { name: 'owner', type: 'address' },
            { name: 'expiresAt', type: 'uint256' },
            { name: 'createdAt', type: 'uint256' },
            { name: 'chainId', type: 'uint256' },
          ],
        } as const;

        const message = {
          sessionKey: sessionAddress,
          owner: address as `0x${string}`,
          expiresAt: BigInt(expiresAt),
          createdAt: BigInt(createdAt),
          chainId: BigInt(chainId),
        } as const;

        // Request user signature to authorize the session
        let authorizationSignature: Hex;
        try {
          authorizationSignature = await signTypedDataAsync({
            domain,
            types,
            primaryType: 'SessionAuthorization',
            message,
          });
        } catch (signError: unknown) {
          const errorMessage =
            signError instanceof Error
              ? signError.message
              : 'Signature rejected';
          if (
            errorMessage.includes('User rejected') ||
            errorMessage.includes('rejected')
          ) {
            return {
              success: false,
              error: 'Session authorization was rejected',
            };
          }
          return {
            success: false,
            error: `Failed to sign authorization: ${errorMessage}`,
          };
        }

        const newSession: StoredLocalSessionData = {
          privateKey,
          expiresAt,
          authorizedBy: address,
          chainId,
          createdAt,
          sessionAddress,
          authorizationSignature,
        };

        // Store the session
        const sessions = loadStoredSessions();
        const key = getStorageKey(address, chainId);
        sessions[key] = newSession;
        saveStoredSessions(sessions);

        setLocalSessionData(newSession);

        return { success: true };
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsCreating(false);
    }
  }, [
    address,
    chainId,
    sessionDurationHours,
    hasConnectedWallet,
    signTypedDataAsync,
    useZeroDevMode,
    smartAccount,
  ]);

  // Revoke the current session
  const revokeSession = useCallback(() => {
    if (useZeroDevMode) {
      smartAccount.revokeSession();
    } else {
      if (!address || !chainId) return;
      const sessions = loadStoredSessions();
      const key = getStorageKey(address, chainId);
      delete sessions[key];
      saveStoredSessions(sessions);
      setLocalSessionData(null);
    }
    setError(null);
  }, [address, chainId, useZeroDevMode, smartAccount]);

  // Check if session is valid
  const isSessionValid = useCallback((): boolean => {
    if (useZeroDevMode) {
      return smartAccount.hasValidSession;
    }
    if (!localSessionData) return false;
    return localSessionData.expiresAt > Date.now();
  }, [useZeroDevMode, smartAccount.hasValidSession, localSessionData]);

  // Get the local session signer account
  const getSessionSigner = useCallback((): LocalAccount | null => {
    if (useZeroDevMode) {
      // ZeroDev mode doesn't use local signers
      return null;
    }
    if (!localSessionData || localSessionData.expiresAt <= Date.now()) {
      return null;
    }
    try {
      return privateKeyToAccount(localSessionData.privateKey);
    } catch {
      return null;
    }
  }, [useZeroDevMode, localSessionData]);

  // Get ZeroDev session client
  const getZeroDevSessionClient =
    useCallback(async (): Promise<SmartAccountClient | null> => {
      if (!useZeroDevMode) return null;
      return smartAccount.getSessionClient();
    }, [useZeroDevMode, smartAccount]);

  // Get ZeroDev session client for a specific chain
  const getZeroDevSessionClientForChain =
    useCallback(async (targetChainId: number): Promise<SmartAccountClient | null> => {
      if (!useZeroDevMode) return null;
      return smartAccount.getSessionClientForChain(targetChainId);
    }, [useZeroDevMode, smartAccount]);

  // Sign typed data using the active session (works in both ZeroDev and local modes)
  const signTypedDataWithSession = useCallback(
    async (params: {
      domain: TypedDataDomain;
      types: Record<string, readonly { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<Hex | null> => {
      // Check if session is valid
      if (!isSessionValid()) {
        console.warn('[SessionKey] No valid session for signing');
        return null;
      }

      if (useZeroDevMode) {
        // Use ZeroDev smart account for signing
        const client = await smartAccount.getSessionClient();
        if (!client) {
          console.warn('[SessionKey] ZeroDev session client not available');
          return null;
        }
        try {
          const signature = await client.signTypedData(params);
          return signature;
        } catch (err) {
          console.error('[SessionKey] ZeroDev signing failed:', err);
          return null;
        }
      } else {
        // Use local session key for signing
        const signer = getSessionSigner();
        if (!signer) {
          console.warn('[SessionKey] Local session signer not available');
          return null;
        }
        try {
          const signature = await signer.signTypedData({
            domain: params.domain,
            types: params.types,
            primaryType: params.primaryType,
            message: params.message,
          });
          return signature;
        } catch (err) {
          console.error('[SessionKey] Local signing failed:', err);
          return null;
        }
      }
    },
    [useZeroDevMode, smartAccount, isSessionValid, getSessionSigner]
  );

  // Derive session account for local mode
  const sessionAccount = useMemo((): LocalAccount | null => {
    if (useZeroDevMode || !localSessionData) return null;
    try {
      return privateKeyToAccount(localSessionData.privateKey);
    } catch {
      return null;
    }
  }, [useZeroDevMode, localSessionData]);

  // Derive hasValidSession
  const hasValidSession = useMemo((): boolean => {
    if (useZeroDevMode) {
      return smartAccount.hasValidSession;
    }
    return localSessionData != null && localSessionData.expiresAt > Date.now();
  }, [useZeroDevMode, smartAccount.hasValidSession, localSessionData]);

  // Derive expiresAt
  const expiresAt = useMemo((): number | null => {
    if (useZeroDevMode) {
      return smartAccount.sessionExpiresAt;
    }
    return localSessionData?.expiresAt ?? null;
  }, [useZeroDevMode, smartAccount.sessionExpiresAt, localSessionData]);

  const value: SessionKeyContextValue = {
    hasValidSession,
    sessionAccount,
    expiresAt,
    isSessionModeEnabled: sessionMode === 'periodically',
    sessionDurationHours,
    isZeroDevMode: useZeroDevMode,
    smartAccountAddress: useZeroDevMode
      ? smartAccount.smartAccountAddress
      : null,
    isZeroDevSupported: smartAccount.isSupported,
    isCreating: isCreating || smartAccount.isLoading,
    error: error || smartAccount.error,
    createSession,
    revokeSession,
    isSessionValid,
    getSessionSigner,
    getZeroDevSessionClient,
    getZeroDevSessionClientForChain,
    signTypedDataWithSession,
    refreshSession,
    // Arbitrum session info (for forecasting when on other chains)
    hasValidArbitrumSession: smartAccount.hasArbitrumSession,
    arbitrumSessionExpiresAt: smartAccount.arbitrumSessionExpiresAt,
  };

  return (
    <SessionKeyContext.Provider value={value}>
      {children}
    </SessionKeyContext.Provider>
  );
};

/**
 * Hook to access session key functionality
 */
export function useSessionKey(): SessionKeyContextValue {
  const ctx = useContext(SessionKeyContext);
  if (!ctx) {
    throw new Error('useSessionKey must be used within a SessionKeyProvider');
  }
  return ctx;
}

/**
 * Hook to check if session signing should be used
 * Returns true if session mode is enabled and a valid session exists
 */
export function useShouldUseSessionKey(): boolean {
  const ctx = useContext(SessionKeyContext);
  if (!ctx) return false;
  return ctx.isSessionModeEnabled && ctx.hasValidSession;
}

/**
 * Hook to get session signer for signing operations (local mode only)
 * Returns null if using ZeroDev mode, session mode is disabled, or no valid session
 */
export function useSessionSigner(): LocalAccount | null {
  const ctx = useContext(SessionKeyContext);
  if (!ctx) return null;
  if (!ctx.isSessionModeEnabled) return null;
  if (ctx.isZeroDevMode) return null; // Use getZeroDevSessionClient instead
  return ctx.getSessionSigner();
}
