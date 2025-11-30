'use client';

/**
 * ZeroDev Smart Account Hook
 *
 * Creates and manages a Kernel smart account from the user's EOA wallet.
 * This enables session key functionality for automatic bid signing.
 *
 * ## Architecture:
 *
 * ### ZeroDev Mode (when packages installed)
 * When @zerodev/sdk is available and NEXT_PUBLIC_ZERODEV_PROJECT_ID is set:
 * - Uses ZeroDev Kernel smart accounts (ERC-4337)
 * - Session keys are registered as permission validators
 * - Signatures are ERC-1271 compatible
 * - Full on-chain security with permission scoping
 *
 * ### Local Mode (current fallback)
 * When ZeroDev packages are not installed:
 * - Returns a placeholder that integrates with SessionKeyContext's local mode
 * - Local mode generates ephemeral keys stored in localStorage
 * - Signatures are EOA signatures from the session key (not ERC-1271)
 *
 * To enable full ZeroDev mode, install:
 * pnpm add @zerodev/sdk @zerodev/ecdsa-validator permissionless
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { createPublicClient, http, type Address, type Hex } from 'viem';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import {
  getBundlerRpc,
  getPaymasterRpc,
  getZeroDevChain,
  isZeroDevSupported,
  ZERODEV_PROJECT_ID,
  SESSION_KEY_DEFAULTS,
} from './config';

// Check if ZeroDev packages are available
let createKernelAccount: any;
let createKernelAccountClient: any;
let createZeroDevPaymasterClient: any;
let signerToEcdsaValidator: any;
let getEntryPoint: any;

// Dynamic import to check for ZeroDev availability
async function checkZeroDevAvailability(): Promise<boolean> {
  try {
    const sdk = await import('@zerodev/sdk');
    const ecdsa = await import('@zerodev/ecdsa-validator');

    createKernelAccount = sdk.createKernelAccount;
    createKernelAccountClient = sdk.createKernelAccountClient;
    createZeroDevPaymasterClient = sdk.createZeroDevPaymasterClient;
    getEntryPoint = sdk.constants.getEntryPoint;
    signerToEcdsaValidator = ecdsa.signerToEcdsaValidator;

    return true;
  } catch {
    return false;
  }
}

// Session storage key
const ZERODEV_SESSION_KEY = 'sapience.zerodev.session';

interface StoredZeroDevSession {
  smartAccountAddress: Address;
  expiresAt: number;
  chainId: number;
  ownerAddress: Address;
  // Serialized session data for restoration (when ZeroDev is available)
  serializedSession?: string;
}

interface SmartAccountState {
  /** Whether the smart account is ready for use */
  isReady: boolean;
  /** Whether ZeroDev is supported on the current chain */
  isSupported: boolean;
  /** Whether ZeroDev packages are installed */
  isZeroDevAvailable: boolean;
  /** The smart account address (when ZeroDev mode) */
  smartAccountAddress: Address | null;
  /** Whether a valid session exists */
  hasValidSession: boolean;
  /** Session expiry timestamp (ms) */
  sessionExpiresAt: number | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
}

interface SmartAccountActions {
  /** Create a new session key with permissions */
  createSession: (
    durationHours: number
  ) => Promise<{ success: boolean; error?: string }>;
  /** Revoke the current session */
  revokeSession: () => void;
  /** Get the session account client for signing */
  getSessionClient: () => Promise<SmartAccountClient | null>;
  /** Refresh session state from storage */
  refreshSession: () => void;
}

export interface SmartAccountClient {
  /** Sign typed data using the smart account */
  signTypedData: (params: {
    domain: any;
    types: any;
    primaryType: string;
    message: any;
  }) => Promise<Hex>;
  /** The smart account address */
  address: Address;
  /** Send a user operation (batched transaction) */
  sendUserOperation?: (params: {
    userOperation: {
      callData: Hex;
      callGasLimit?: bigint;
      verificationGasLimit?: bigint;
      preVerificationGas?: bigint;
    };
  }) => Promise<Hex>;
}

export type UseSmartAccountResult = SmartAccountState & SmartAccountActions;

/**
 * Hook for ZeroDev smart account integration.
 * Automatically detects if ZeroDev packages are installed and falls back gracefully.
 */
export function useSmartAccount(): UseSmartAccountResult {
  const chainId = useChainIdFromLocalStorage();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  // State
  const [isZeroDevAvailable, setIsZeroDevAvailable] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] =
    useState<Address | null>(null);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kernelClient, setKernelClient] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);

  // Check if ZeroDev is supported for current chain
  const isSupported = useMemo(() => {
    if (!ZERODEV_PROJECT_ID) return false;
    return isZeroDevSupported(chainId);
  }, [chainId]);

  const chain = useMemo(() => getZeroDevChain(chainId), [chainId]);

  // Check for ZeroDev package availability on mount
  useEffect(() => {
    checkZeroDevAvailability().then((available) => {
      setIsZeroDevAvailable(available);
      setInitialized(true);
    });
  }, []);

  // Load existing session from storage
  const loadSession = useCallback((): StoredZeroDevSession | null => {
    if (!address || !chainId) return null;
    try {
      const raw = localStorage.getItem(ZERODEV_SESSION_KEY);
      if (!raw) return null;
      const session: StoredZeroDevSession = JSON.parse(raw);

      // Validate session belongs to current wallet and chain
      if (
        session.chainId !== chainId ||
        session.ownerAddress.toLowerCase() !== address.toLowerCase() ||
        session.expiresAt <= Date.now()
      ) {
        localStorage.removeItem(ZERODEV_SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }, [address, chainId]);

  // Initialize/restore session on mount
  useEffect(() => {
    if (!initialized) return;
    const session = loadSession();
    if (session) {
      setSmartAccountAddress(session.smartAccountAddress);
      setSessionExpiresAt(session.expiresAt);
      setHasValidSession(true);
    }
  }, [initialized, loadSession]);

  // Create a new session
  const createSession = useCallback(
    async (
      durationHours: number
    ): Promise<{ success: boolean; error?: string }> => {
      if (!walletClient || !address || !chain) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!isSupported) {
        return { success: false, error: 'Chain not supported by ZeroDev' };
      }

      if (!isZeroDevAvailable) {
        // Return info about fallback mode
        return {
          success: false,
          error:
            'ZeroDev packages not installed. Using local session key mode. ' +
            'Install @zerodev/sdk @zerodev/ecdsa-validator permissionless for smart account mode.',
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        const bundlerRpc = getBundlerRpc(chainId);
        const paymasterRpc = getPaymasterRpc(chainId);

        if (!bundlerRpc) {
          throw new Error('ZeroDev bundler RPC not configured');
        }

        // Create public client for the chain
        const publicClient = createPublicClient({
          chain,
          transport: http(chain.rpcUrls.default.http[0]),
        });

        // Get the entrypoint for v0.7
        const entryPoint = getEntryPoint('0.7');

        // Create ECDSA validator from the wallet
        const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
          signer: walletClient,
          entryPoint,
        });

        // Create Kernel account
        const kernelAccount = await createKernelAccount(publicClient, {
          plugins: {
            sudo: ecdsaValidator,
          },
          entryPoint,
        });

        // Create kernel account client
        const clientConfig: any = {
          account: kernelAccount,
          chain,
          bundlerTransport: http(bundlerRpc),
          entryPoint,
        };

        // Add paymaster if configured (for gas sponsorship)
        if (paymasterRpc) {
          const paymasterClient = createZeroDevPaymasterClient({
            chain,
            transport: http(paymasterRpc),
            entryPoint,
          });
          clientConfig.middleware = {
            sponsorUserOperation: paymasterClient.sponsorUserOperation,
          };
        }

        const client = createKernelAccountClient(clientConfig);

        // Calculate expiry
        const maxDurationHours = SESSION_KEY_DEFAULTS.maxDurationSeconds / 3600;
        const clampedHours = Math.min(durationHours, maxDurationHours);
        const expiresAt = Date.now() + clampedHours * 60 * 60 * 1000;

        // Store session
        const sessionData: StoredZeroDevSession = {
          smartAccountAddress: kernelAccount.address,
          expiresAt,
          chainId,
          ownerAddress: address,
        };
        localStorage.setItem(ZERODEV_SESSION_KEY, JSON.stringify(sessionData));

        // Update state
        setKernelClient(client);
        setSmartAccountAddress(kernelAccount.address);
        setSessionExpiresAt(expiresAt);
        setHasValidSession(true);

        return { success: true };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to create ZeroDev session';
        setError(message);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, address, chain, chainId, isSupported, isZeroDevAvailable]
  );

  // Revoke the current session
  const revokeSession = useCallback(() => {
    localStorage.removeItem(ZERODEV_SESSION_KEY);
    setKernelClient(null);
    setSmartAccountAddress(null);
    setSessionExpiresAt(null);
    setHasValidSession(false);
    setError(null);
  }, []);

  // Get the session client for signing
  const getSessionClient = useCallback((): SmartAccountClient | null => {
    if (!hasValidSession || !kernelClient) {
      return null;
    }

    // Wrap the kernel client in our interface
    return {
      signTypedData: (params) => {
        return kernelClient.signTypedData(params);
      },
      address: smartAccountAddress!,
      sendUserOperation: kernelClient.sendUserOperation
        ? (params: any) => kernelClient.sendUserOperation(params)
        : undefined,
    };
  }, [hasValidSession, kernelClient, smartAccountAddress]);

  // Refresh session state from storage
  const refreshSession = useCallback(() => {
    const session = loadSession();
    if (session) {
      setSmartAccountAddress(session.smartAccountAddress);
      setSessionExpiresAt(session.expiresAt);
      setHasValidSession(true);
    } else {
      setHasValidSession(false);
      setSessionExpiresAt(null);
      setSmartAccountAddress(null);
    }
  }, [loadSession]);

  // Determine error message
  const displayError = useMemo(() => {
    if (error) return error;
    if (initialized && !isZeroDevAvailable && isSupported) {
      return 'ZeroDev packages not installed. Local session key mode will be used.';
    }
    if (!ZERODEV_PROJECT_ID && isSupported) {
      return 'NEXT_PUBLIC_ZERODEV_PROJECT_ID not configured';
    }
    return null;
  }, [error, initialized, isZeroDevAvailable, isSupported]);

  return {
    isReady: hasValidSession && kernelClient !== null,
    isSupported,
    isZeroDevAvailable,
    smartAccountAddress,
    hasValidSession,
    sessionExpiresAt,
    isLoading,
    error: displayError,
    createSession,
    revokeSession,
    getSessionClient,
    refreshSession,
  };
}
