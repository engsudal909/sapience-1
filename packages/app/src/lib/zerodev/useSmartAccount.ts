'use client';

/**
 * ZeroDev Smart Account Hook with Session Keys
 *
 * Creates and manages a Kernel smart account with session key support.
 * Session keys allow transactions to be signed without wallet prompts.
 *
 * ## How it works:
 * 1. User creates a session - wallet signs to authorize an ephemeral key
 * 2. The ephemeral key is stored locally and used for signing
 * 3. Transactions are sent via the smart account using the session key
 * 4. No wallet prompts needed until the session expires
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  encodeFunctionData,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  getBundlerRpc,
  getPaymasterRpc,
  getZeroDevChain,
  isZeroDevSupported,
  ZERODEV_PROJECT_ID,
  SESSION_KEY_DEFAULTS,
} from './config';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

// ZeroDev SDK imports - dynamically loaded
let createKernelAccount: any;
let createKernelAccountClient: any;
let createZeroDevPaymasterClient: any;
let signerToEcdsaValidator: any;
let getEntryPoint: any;
let KERNEL_V3_1: any;
let toECDSASigner: any;
let toPermissionValidator: any;
let serializePermissionAccount: any;
let deserializePermissionAccount: any;
let ParamCondition: any;

// Check if ZeroDev packages are available
async function checkZeroDevAvailability(): Promise<boolean> {
  try {
    const sdk = await import('@zerodev/sdk');
    const ecdsa = await import('@zerodev/ecdsa-validator');
    const constants = await import('@zerodev/sdk/constants');
    const permissions = await import('@zerodev/permissions');
    const permissionSigners = await import('@zerodev/permissions/signers');

    createKernelAccount = sdk.createKernelAccount;
    createKernelAccountClient = sdk.createKernelAccountClient;
    createZeroDevPaymasterClient = sdk.createZeroDevPaymasterClient;
    getEntryPoint = constants.getEntryPoint;
    signerToEcdsaValidator = ecdsa.signerToEcdsaValidator;
    // Use KERNEL_V3_1 for EntryPoint 0.7 (required by @zerodev/permissions)
    KERNEL_V3_1 = constants.KERNEL_V3_1;

    // Permissions/session key imports
    toPermissionValidator = permissions.toPermissionValidator;
    serializePermissionAccount = permissions.serializePermissionAccount;
    deserializePermissionAccount = permissions.deserializePermissionAccount;
    ParamCondition = permissions.ParamCondition;
    toECDSASigner = permissionSigners.toECDSASigner;

    return true;
  } catch (e) {
    console.warn('[ZeroDev] Failed to load packages:', e);
    return false;
  }
}

// Session storage key prefix
const ZERODEV_SESSION_KEY_PREFIX = 'sapience.zerodev.session';

function getSessionStorageKey(chainId: number): string {
  return `${ZERODEV_SESSION_KEY_PREFIX}.${chainId}`;
}

interface StoredZeroDevSession {
  smartAccountAddress: Address;
  expiresAt: number;
  chainId: number;
  ownerAddress: Address;
  // The ephemeral session private key
  sessionPrivateKey: Hex;
  // Serialized permission account for restoration
  serializedSession: string;
}

interface SmartAccountState {
  isReady: boolean;
  isSupported: boolean;
  isZeroDevAvailable: boolean;
  smartAccountAddress: Address | null;
  hasValidSession: boolean;
  sessionExpiresAt: number | null;
  isLoading: boolean;
  error: string | null;
}

interface SmartAccountActions {
  createSession: (durationHours: number) => Promise<{ success: boolean; error?: string }>;
  revokeSession: () => void;
  getSessionClient: () => Promise<SmartAccountClient | null>;
  getSessionClientForChain: (targetChainId: number) => Promise<SmartAccountClient | null>;
  refreshSession: (forChainId?: number) => void;
}

export interface SmartAccountClient {
  signTypedData: (params: {
    domain: any;
    types: any;
    primaryType: string;
    message: any;
  }) => Promise<Hex>;
  address: Address;
  sendUserOperation?: (params: {
    callData: Array<{ to: Address; data: Hex; value: bigint }>;
  }) => Promise<Hex>;
}

export type UseSmartAccountResult = SmartAccountState & SmartAccountActions & {
  hasArbitrumSession: boolean;
  arbitrumSessionExpiresAt: number | null;
};

export function useSmartAccount(): UseSmartAccountResult {
  const chainId = useChainIdFromLocalStorage();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  // State
  const [isZeroDevAvailable, setIsZeroDevAvailable] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<Address | null>(null);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionClient, setSessionClient] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);

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

  // Load session from localStorage for a specific chain
  const loadSession = useCallback((forChainId?: number): StoredZeroDevSession | null => {
    if (!address) return null;
    const targetChainId = forChainId ?? chainId;
    if (!targetChainId) return null;

    try {
      const storageKey = getSessionStorageKey(targetChainId);
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const session: StoredZeroDevSession = JSON.parse(raw);

      // Validate session belongs to current wallet and hasn't expired
      if (
        session.ownerAddress.toLowerCase() !== address.toLowerCase() ||
        session.expiresAt <= Date.now()
      ) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }, [address, chainId]);

  // Check for Arbitrum session
  const arbitrumSession = useMemo(() => {
    if (!address) return null;
    return loadSession(42161);
  }, [address, loadSession]);

  // Restore session client from stored session
  const restoreSessionClient = useCallback(async (
    session: StoredZeroDevSession,
    targetChainId: number
  ): Promise<any> => {
    console.log('[useSmartAccount] restoreSessionClient called', {
      targetChainId,
      isZeroDevAvailable,
      hasWalletClient: !!walletClient,
      sessionSmartAccountAddress: session.smartAccountAddress,
    });

    if (!isZeroDevAvailable || !walletClient) {
      console.log('[useSmartAccount] restoreSessionClient early return - missing deps');
      return null;
    }

    const targetChain = getZeroDevChain(targetChainId);
    if (!targetChain) {
      console.log('[useSmartAccount] restoreSessionClient - chain not supported');
      return null;
    }

    try {
      const bundlerRpc = getBundlerRpc(targetChainId);
      const paymasterRpc = getPaymasterRpc(targetChainId);
      console.log('[useSmartAccount] restoreSessionClient - RPC URLs', {
        bundlerRpc,
        paymasterRpc,
      });
      if (!bundlerRpc) return null;

      const publicClient = createPublicClient({
        chain: targetChain,
        transport: http(targetChain.rpcUrls.default.http[0]),
      });

      const entryPoint = getEntryPoint('0.7');

      // Deserialize the permission account
      console.log('[useSmartAccount] Deserializing permission account...');
      const sessionKeyAccount = await deserializePermissionAccount(
        publicClient,
        entryPoint,
        KERNEL_V3_1,
        session.serializedSession
      );
      console.log('[useSmartAccount] Permission account deserialized:', sessionKeyAccount.address);

      // Create kernel account client with the session key
      const clientConfig: any = {
        account: sessionKeyAccount,
        chain: targetChain,
        bundlerTransport: http(bundlerRpc),
        entryPoint,
      };

      // Always try to add paymaster for gas sponsorship
      if (paymasterRpc) {
        console.log('[useSmartAccount] Setting up paymaster with sponsorUserOperation middleware...');
        try {
          const paymasterClient = createZeroDevPaymasterClient({
            chain: targetChain,
            transport: http(paymasterRpc),
            entryPoint,
          });
          // Use middleware pattern for sponsorUserOperation
          clientConfig.middleware = {
            sponsorUserOperation: async ({ userOperation }: { userOperation: any }) => {
              console.log('[useSmartAccount] Sponsoring UserOperation...');
              return paymasterClient.sponsorUserOperation({ userOperation });
            },
          };
          console.log('[useSmartAccount] Paymaster middleware configured successfully');
        } catch (paymasterError) {
          console.error('[useSmartAccount] Failed to create paymaster client:', paymasterError);
        }
      } else {
        console.warn('[useSmartAccount] No paymaster RPC configured');
      }

      const client = createKernelAccountClient(clientConfig);
      console.log('[useSmartAccount] Kernel client created');
      return client;
    } catch (err) {
      console.error('[ZeroDev] Failed to restore session client:', err);
      return null;
    }
  }, [isZeroDevAvailable, walletClient]);

  // Initialize/restore session on mount and when chain changes
  useEffect(() => {
    if (!initialized) return;

    const session = loadSession();
    if (session) {
      setSmartAccountAddress(session.smartAccountAddress);
      setSessionExpiresAt(session.expiresAt);
      setHasValidSession(true);

      // Restore the session client
      restoreSessionClient(session, chainId).then((client) => {
        if (client) {
          setSessionClient(client);
        }
      });
    } else {
      setSmartAccountAddress(null);
      setSessionExpiresAt(null);
      setHasValidSession(false);
      setSessionClient(null);
    }
  }, [initialized, loadSession, chainId, restoreSessionClient]);

  // Create a new session with ephemeral key
  const createSession = useCallback(
    async (durationHours: number): Promise<{ success: boolean; error?: string }> => {
      if (!walletClient || !address || !chain) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!isSupported) {
        return { success: false, error: 'Chain not supported by ZeroDev' };
      }

      if (!isZeroDevAvailable) {
        return {
          success: false,
          error: 'ZeroDev packages not installed.',
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

        const publicClient = createPublicClient({
          chain,
          transport: http(chain.rpcUrls.default.http[0]),
        });

        const entryPoint = getEntryPoint('0.7');

        if (!KERNEL_V3_1) {
          throw new Error('KERNEL_V3_1 constant not available.');
        }

        // Create ECDSA validator from the wallet (sudo key)
        const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
          signer: walletClient,
          entryPoint,
          kernelVersion: KERNEL_V3_1,
        });

        // Generate ephemeral session key
        const sessionPrivateKey = generatePrivateKey();
        const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

        // Create session key signer
        const sessionKeySigner = await toECDSASigner({
          signer: sessionKeyAccount,
        });

        // Calculate expiry
        const maxDurationHours = SESSION_KEY_DEFAULTS.maxDurationSeconds / 3600;
        const clampedHours = Math.min(durationHours, maxDurationHours);
        const expiresAt = Date.now() + clampedHours * 60 * 60 * 1000;
        const validUntil = Math.floor(expiresAt / 1000);

        // Create permission validator with the session key
        // This allows the session key to sign any call (permissive for now)
        const permissionValidator = await toPermissionValidator(publicClient, {
          entryPoint,
          kernelVersion: KERNEL_V3_1,
          signer: sessionKeySigner,
          policies: [
            // You can add more restrictive policies here if needed
            // For now, we allow all calls within the time window
          ],
        });

        // Create kernel account with session key as the validator
        const kernelAccount = await createKernelAccount(publicClient, {
          plugins: {
            sudo: ecdsaValidator,
            regular: permissionValidator,
          },
          entryPoint,
          kernelVersion: KERNEL_V3_1,
        });

        // Serialize the permission account for storage
        const serializedSession = await serializePermissionAccount(
          kernelAccount,
          sessionPrivateKey
        );

        // Create kernel account client
        const clientConfig: any = {
          account: kernelAccount,
          chain,
          bundlerTransport: http(bundlerRpc),
          entryPoint,
        };

        // Add paymaster for gas sponsorship
        if (paymasterRpc) {
          console.log('[useSmartAccount] createSession - Setting up paymaster middleware...');
          const paymasterClient = createZeroDevPaymasterClient({
            chain,
            transport: http(paymasterRpc),
            entryPoint,
          });
          // Use middleware pattern for sponsorUserOperation
          clientConfig.middleware = {
            sponsorUserOperation: async ({ userOperation }: { userOperation: any }) => {
              console.log('[useSmartAccount] createSession - Sponsoring UserOperation...');
              return paymasterClient.sponsorUserOperation({ userOperation });
            },
          };
        }

        const client = createKernelAccountClient(clientConfig);
        console.log('[useSmartAccount] createSession - Kernel client created');

        // Store session
        const sessionData: StoredZeroDevSession = {
          smartAccountAddress: kernelAccount.address,
          expiresAt,
          chainId,
          ownerAddress: address,
          sessionPrivateKey,
          serializedSession,
        };
        const storageKey = getSessionStorageKey(chainId);
        localStorage.setItem(storageKey, JSON.stringify(sessionData));

        // Update state
        setSessionClient(client);
        setSmartAccountAddress(kernelAccount.address);
        setSessionExpiresAt(expiresAt);
        setHasValidSession(true);

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create session';
        console.error('[ZeroDev] Session creation error:', err);
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
    if (chainId) {
      const storageKey = getSessionStorageKey(chainId);
      localStorage.removeItem(storageKey);
    }
    setSessionClient(null);
    setSmartAccountAddress(null);
    setSessionExpiresAt(null);
    setHasValidSession(false);
    setError(null);
  }, [chainId]);

  // Get session client for current chain
  const getSessionClient = useCallback(async (): Promise<SmartAccountClient | null> => {
    if (sessionClient && hasValidSession) {
      const sendMethod = sessionClient.sendTransactions || sessionClient.sendTransaction || sessionClient.sendUserOperation;
      return {
        signTypedData: (params) => sessionClient.signTypedData(params),
        address: smartAccountAddress!,
        sendUserOperation: sendMethod
          ? async (params: { callData: Array<{ to: Address; data: Hex; value: bigint }> }) => {
              const calls = params.callData;
              if (sessionClient.sendTransactions) {
                const userOpHash = await sessionClient.sendTransactions({
                  transactions: calls.map((call: { to: Address; data: Hex; value: bigint }) => ({
                    to: call.to,
                    data: call.data,
                    value: call.value,
                  })),
                });
                return userOpHash;
              }
              if (sessionClient.sendTransaction && calls.length === 1) {
                const userOpHash = await sessionClient.sendTransaction({
                  to: calls[0].to,
                  data: calls[0].data,
                  value: calls[0].value,
                });
                return userOpHash;
              }
              if (sessionClient.sendUserOperation) {
                const userOpHash = await sessionClient.sendUserOperation({
                  callData: calls,
                });
                return userOpHash;
              }
              throw new Error('No suitable send method available on session client');
            }
          : undefined,
      };
    }

    // Try to restore from storage
    const session = loadSession();
    if (!session) return null;

    const client = await restoreSessionClient(session, chainId);
    if (!client) return null;

    setSessionClient(client);

    const sendMethod = client.sendTransactions || client.sendTransaction || client.sendUserOperation;
    return {
      signTypedData: (params) => client.signTypedData(params),
      address: session.smartAccountAddress,
      sendUserOperation: sendMethod
        ? async (params: { callData: Array<{ to: Address; data: Hex; value: bigint }> }) => {
            const calls = params.callData;
            if (client.sendTransactions) {
              const userOpHash = await client.sendTransactions({
                transactions: calls.map((call: { to: Address; data: Hex; value: bigint }) => ({
                  to: call.to,
                  data: call.data,
                  value: call.value,
                })),
              });
              return userOpHash;
            }
            if (client.sendTransaction && calls.length === 1) {
              const userOpHash = await client.sendTransaction({
                to: calls[0].to,
                data: calls[0].data,
                value: calls[0].value,
              });
              return userOpHash;
            }
            if (client.sendUserOperation) {
              const userOpHash = await client.sendUserOperation({
                callData: calls,
              });
              return userOpHash;
            }
            throw new Error('No suitable send method available on client');
          }
        : undefined,
    };
  }, [sessionClient, hasValidSession, smartAccountAddress, loadSession, restoreSessionClient, chainId]);

  // Get session client for a specific chain
  const getSessionClientForChain = useCallback(async (targetChainId: number): Promise<SmartAccountClient | null> => {
    console.log('[useSmartAccount] getSessionClientForChain called', {
      targetChainId,
      currentChainId: chainId,
      isSameChain: targetChainId === chainId,
    });

    if (targetChainId === chainId) {
      return getSessionClient();
    }

    const session = loadSession(targetChainId);
    console.log('[useSmartAccount] Loaded session for chain', targetChainId, {
      hasSession: !!session,
      smartAccountAddress: session?.smartAccountAddress,
      expiresAt: session?.expiresAt,
    });
    if (!session) return null;

    const client = await restoreSessionClient(session, targetChainId);
    console.log('[useSmartAccount] Restored session client', {
      hasClient: !!client,
      hasSendTransactions: !!client?.sendTransactions,
      hasSendTransaction: !!client?.sendTransaction,
      hasSendUserOperation: !!client?.sendUserOperation,
      clientMethods: client ? Object.keys(client).filter(k => typeof client[k] === 'function') : [],
    });
    if (!client) return null;

    // Try different method names that might be available on the kernel client
    const sendMethod = client.sendTransactions || client.sendTransaction || client.sendUserOperation;

    return {
      signTypedData: (params) => client.signTypedData(params),
      address: session.smartAccountAddress,
      sendUserOperation: sendMethod
        ? async (params: { callData: Array<{ to: Address; data: Hex; value: bigint }> }) => {
            const calls = params.callData;
            // Try sendTransactions first (for batched calls)
            if (client.sendTransactions) {
              const userOpHash = await client.sendTransactions({
                transactions: calls.map((call: { to: Address; data: Hex; value: bigint }) => ({
                  to: call.to,
                  data: call.data,
                  value: call.value,
                })),
              });
              return userOpHash;
            }
            // Fallback to sendTransaction for single calls
            if (client.sendTransaction && calls.length === 1) {
              const userOpHash = await client.sendTransaction({
                to: calls[0].to,
                data: calls[0].data,
                value: calls[0].value,
              });
              return userOpHash;
            }
            // Last resort: try sendUserOperation directly
            if (client.sendUserOperation) {
              const userOpHash = await client.sendUserOperation({
                callData: calls,
              });
              return userOpHash;
            }
            throw new Error('No suitable send method available on client');
          }
        : undefined,
    };
  }, [chainId, getSessionClient, loadSession, restoreSessionClient]);

  // Refresh session state from storage
  const refreshSession = useCallback((forChainId?: number) => {
    const targetChainId = forChainId ?? chainId;
    const session = loadSession(targetChainId);

    if (session) {
      setSmartAccountAddress(session.smartAccountAddress);
      setSessionExpiresAt(session.expiresAt);
      setHasValidSession(true);

      // Restore client if for current chain
      if (targetChainId === chainId) {
        restoreSessionClient(session, targetChainId).then((client) => {
          if (client) setSessionClient(client);
        });
      }
    } else {
      setHasValidSession(false);
      setSessionExpiresAt(null);
      setSmartAccountAddress(null);
      setSessionClient(null);
    }
  }, [loadSession, chainId, restoreSessionClient]);

  // Determine error message
  const displayError = useMemo(() => {
    if (error) return error;
    if (initialized && !isZeroDevAvailable && isSupported) {
      return 'ZeroDev packages not installed.';
    }
    if (!ZERODEV_PROJECT_ID && isSupported) {
      return 'NEXT_PUBLIC_ZERODEV_PROJECT_ID not configured';
    }
    return null;
  }, [error, initialized, isZeroDevAvailable, isSupported]);

  return {
    isReady: hasValidSession && sessionClient !== null,
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
    getSessionClientForChain,
    refreshSession,
    hasArbitrumSession: arbitrumSession !== null,
    arbitrumSessionExpiresAt: arbitrumSession?.expiresAt ?? null,
  };
}
