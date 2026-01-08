'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useWallets } from '@privy-io/react-auth';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { KernelAccountClient } from '@zerodev/sdk';
import {
  createSession,
  restoreSession,
  getSmartAccountAddress,
  saveSession,
  loadSession,
  clearSession,
  type SessionConfig,
  type SessionResult,
  type OwnerSigner,
} from '~/lib/session/sessionKeyManager';

// Chain clients type
interface ChainClients {
  ethereal: KernelAccountClient<any, any, any> | null;
  arbitrum: KernelAccountClient<any, any, any> | null;
}

// Type for signTypedData parameters
interface SignTypedDataParams {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: Address;
  };
  types: Record<string, readonly { readonly name: string; readonly type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

// Session metadata for relayer verification
export interface SessionMetadata {
  ownerAddress: Address;
  sessionKeyAddress: Address;
  ownerSignature: Hex;
  sessionExpiresAt: number;
  maxSpendUSDe: string;
}

// Session context value
interface SessionContextValue {
  // Session state
  isSessionActive: boolean;
  sessionConfig: SessionConfig | null;
  chainClients: ChainClients;

  // Session actions
  startSession: (params: { durationHours: number; maxSpendUSDe: bigint }) => Promise<void>;
  endSession: () => void;

  // Status
  isStartingSession: boolean;
  isRestoringSession: boolean;
  sessionError: Error | null;

  // Time remaining in milliseconds
  timeRemainingMs: number;

  // Smart account address (available before session starts)
  smartAccountAddress: Address | null;
  isCalculatingAddress: boolean;

  // Session signing functions (available when session is active)
  signMessage: ((message: string) => Promise<Hex>) | null;
  signTypedData: ((params: SignTypedDataParams) => Promise<Hex>) | null;

  // Session metadata for relayer verification (available when session is active)
  sessionKeyAddress: Address | null;
  ownerSignature: Hex | null;

  // Get full session metadata for including in requests
  getSessionMetadata: (() => SessionMetadata) | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const { wallets } = useWallets();
  const connectedWallet = wallets[0];

  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [chainClients, setChainClients] = useState<ChainClients>({
    ethereal: null,
    arbitrum: null,
  });

  // Status state
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  // Smart account address state
  const [smartAccountAddress, setSmartAccountAddress] = useState<Address | null>(null);
  const [isCalculatingAddress, setIsCalculatingAddress] = useState(false);

  // Time remaining
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);

  // Session private key for signing
  const [sessionPrivateKey, setSessionPrivateKey] = useState<Hex | null>(null);

  // Session metadata for relayer verification
  const [sessionKeyAddress, setSessionKeyAddress] = useState<Address | null>(null);
  const [ownerSignature, setOwnerSignature] = useState<Hex | null>(null);

  // Sign message with session key
  const signMessage = useCallback(
    async (message: string): Promise<Hex> => {
      if (!sessionPrivateKey) {
        throw new Error('No active session');
      }
      const account = privateKeyToAccount(sessionPrivateKey);
      return account.signMessage({ message });
    },
    [sessionPrivateKey]
  );

  // Sign typed data with session key
  const signTypedData = useCallback(
    async (params: SignTypedDataParams): Promise<Hex> => {
      if (!sessionPrivateKey) {
        throw new Error('No active session');
      }
      const account = privateKeyToAccount(sessionPrivateKey);
      return account.signTypedData(params as any);
    },
    [sessionPrivateKey]
  );

  // Get session metadata for including in requests to the relayer
  const getSessionMetadata = useCallback((): SessionMetadata => {
    if (!sessionConfig || !sessionKeyAddress || !ownerSignature) {
      throw new Error('No active session');
    }
    return {
      ownerAddress: sessionConfig.ownerAddress,
      sessionKeyAddress,
      ownerSignature,
      sessionExpiresAt: sessionConfig.expiresAt,
      maxSpendUSDe: sessionConfig.maxSpendUSDe.toString(),
    };
  }, [sessionConfig, sessionKeyAddress, ownerSignature]);

  // Calculate smart account address when wallet connects
  useEffect(() => {
    if (!connectedWallet?.address) {
      setSmartAccountAddress(null);
      return;
    }

    let cancelled = false;

    const calculateAddress = async () => {
      setIsCalculatingAddress(true);
      try {
        const address = await getSmartAccountAddress(connectedWallet.address as Address);
        if (!cancelled) {
          setSmartAccountAddress(address);
        }
      } catch (error) {
        console.error('Failed to calculate smart account address:', error);
        if (!cancelled) {
          setSmartAccountAddress(null);
        }
      } finally {
        if (!cancelled) {
          setIsCalculatingAddress(false);
        }
      }
    };

    void calculateAddress();

    return () => {
      cancelled = true;
    };
  }, [connectedWallet?.address]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const restore = async () => {
      const stored = loadSession();
      console.debug('[SessionContext] Checking for stored session:', stored ? 'found' : 'none');
      if (!stored) return;

      // Check if the stored session matches the current wallet
      if (connectedWallet?.address?.toLowerCase() !== stored.config.ownerAddress.toLowerCase()) {
        clearSession();
        return;
      }

      setIsRestoringSession(true);
      try {
        const result = await restoreSession(stored);
        setSessionConfig(result.config);
        setChainClients({
          ethereal: result.etherealClient,
          arbitrum: result.arbitrumClient,
        });
        setSessionPrivateKey(stored.sessionPrivateKey);
        setSessionKeyAddress(stored.sessionKeyAddress);
        setOwnerSignature(stored.ownerSignature);
        setIsSessionActive(true);
        setTimeRemainingMs(result.config.expiresAt - Date.now());
      } catch (error) {
        console.error('Failed to restore session:', error);
        clearSession();
      } finally {
        setIsRestoringSession(false);
      }
    };

    if (connectedWallet?.address) {
      void restore();
    }
  }, [connectedWallet?.address]);

  // Update time remaining every second
  useEffect(() => {
    if (!isSessionActive || !sessionConfig) return;

    const interval = setInterval(() => {
      const remaining = sessionConfig.expiresAt - Date.now();
      if (remaining <= 0) {
        // Session expired
        endSessionInternal();
      } else {
        setTimeRemainingMs(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, sessionConfig]);

  // Internal end session function
  const endSessionInternal = useCallback(() => {
    console.debug('[SessionContext] Ending session, clearing state and localStorage');
    setIsSessionActive(false);
    setSessionConfig(null);
    setChainClients({ ethereal: null, arbitrum: null });
    setSessionPrivateKey(null);
    setSessionKeyAddress(null);
    setOwnerSignature(null);
    setTimeRemainingMs(0);
    clearSession();
    console.debug('[SessionContext] Session cleared');
  }, []);

  // Start a new session
  const startSession = useCallback(
    async (params: { durationHours: number; maxSpendUSDe: bigint }) => {
      if (!connectedWallet?.address) {
        throw new Error('No wallet connected');
      }

      setIsStartingSession(true);
      setSessionError(null);

      try {
        // Get the Ethereum provider from the connected wallet
        const provider = await connectedWallet.getEthereumProvider();

        // Create owner signer that uses the wallet to sign messages
        const ownerSigner: OwnerSigner = {
          address: connectedWallet.address as Address,
          signMessage: async ({ message }) => {
            // Use personal_sign via the wallet's provider
            const messageStr = typeof message === 'string' ? message : message.raw;
            const signature = await provider.request({
              method: 'personal_sign',
              params: [messageStr, connectedWallet.address],
            });
            return signature as Hex;
          },
        };

        const result = await createSession(
          ownerSigner,
          params.durationHours,
          params.maxSpendUSDe
        );

        // Save to localStorage
        saveSession(result.serialized);
        console.debug('[SessionContext] Session saved to localStorage');

        // Update state
        setSessionConfig(result.config);
        setChainClients({
          ethereal: result.etherealClient,
          arbitrum: result.arbitrumClient,
        });
        setSessionPrivateKey(result.serialized.sessionPrivateKey);
        setSessionKeyAddress(result.serialized.sessionKeyAddress);
        setOwnerSignature(result.serialized.ownerSignature);
        setIsSessionActive(true);
        setTimeRemainingMs(result.config.expiresAt - Date.now());
        console.debug('[SessionContext] Session active, smart account:', result.config.smartAccountAddress);
      } catch (error) {
        console.error('Failed to start session:', error);
        setSessionError(error instanceof Error ? error : new Error('Failed to start session'));
        throw error;
      } finally {
        setIsStartingSession(false);
      }
    },
    [connectedWallet]
  );

  // End the current session
  const endSession = useCallback(() => {
    endSessionInternal();
  }, [endSessionInternal]);

  // Clear session when wallet disconnects
  useEffect(() => {
    if (!connectedWallet?.address && isSessionActive) {
      endSessionInternal();
    }
  }, [connectedWallet?.address, isSessionActive, endSessionInternal]);

  const value = useMemo(
    () => ({
      isSessionActive,
      sessionConfig,
      chainClients,
      startSession,
      endSession,
      isStartingSession,
      isRestoringSession,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      isCalculatingAddress,
      signMessage: sessionPrivateKey ? signMessage : null,
      signTypedData: sessionPrivateKey ? signTypedData : null,
      sessionKeyAddress,
      ownerSignature,
      getSessionMetadata: isSessionActive ? getSessionMetadata : null,
    }),
    [
      isSessionActive,
      sessionConfig,
      chainClients,
      startSession,
      endSession,
      isStartingSession,
      isRestoringSession,
      sessionError,
      timeRemainingMs,
      smartAccountAddress,
      isCalculatingAddress,
      sessionPrivateKey,
      signMessage,
      signTypedData,
      sessionKeyAddress,
      ownerSignature,
      getSessionMetadata,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

/**
 * Format time remaining as a human-readable string.
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expired';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}
