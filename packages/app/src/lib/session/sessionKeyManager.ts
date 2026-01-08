import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type Chain,
} from 'viem';
import { arbitrum } from 'viem/chains';
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  addressToEmptyAccount,
  type KernelAccountClient,
} from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { toPermissionValidator } from '@zerodev/permissions';
import { toECDSASigner } from '@zerodev/permissions/signers';
import { toSudoPolicy } from '@zerodev/permissions/policies';
import { toSpendingLimitHook } from '@zerodev/hooks';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';

// Ethereal chain definition
export const ethereal: Chain = {
  id: 5064014,
  name: 'Ethereal',
  nativeCurrency: { decimals: 18, name: 'USDe', symbol: 'USDe' },
  rpcUrls: {
    default: { http: ['https://rpc.ethereal.trade'] },
  },
};

// Contract addresses
export const WUSDE_ADDRESS_ETHEREAL = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D' as Address;
export const PREDICTION_MARKET_ETHEREAL = '0xAcD757322df2A1A0B3283c851380f3cFd4882cB4' as Address;
export const EAS_ARBITRUM = '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458' as Address;

// ZeroDev constants
const ENTRY_POINT = getEntryPoint('0.7');
const KERNEL_VERSION = KERNEL_V3_1;

// Get bundler/paymaster URLs from environment
const getZeroDevUrls = (chainId: number) => {
  const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error('NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set');
  }

  // Use environment-specific URLs if available, otherwise construct from project ID
  if (chainId === ethereal.id) {
    return {
      bundlerUrl: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ETHEREAL ||
        `https://rpc.zerodev.app/api/v2/bundler/${projectId}?chainId=${chainId}`,
      paymasterUrl: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ETHEREAL ||
        `https://rpc.zerodev.app/api/v2/paymaster/${projectId}?chainId=${chainId}`,
    };
  }

  if (chainId === arbitrum.id) {
    return {
      bundlerUrl: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL_ARBITRUM ||
        `https://rpc.zerodev.app/api/v2/bundler/${projectId}?chainId=${chainId}`,
      paymasterUrl: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL_ARBITRUM ||
        `https://rpc.zerodev.app/api/v2/paymaster/${projectId}?chainId=${chainId}`,
    };
  }

  throw new Error(`Unsupported chain ID: ${chainId}`);
};

// Session configuration
export interface SessionConfig {
  durationHours: number;
  maxSpendUSDe: bigint;
  expiresAt: number;
  ownerAddress: Address;
  smartAccountAddress: Address;
}

// Serialized session for localStorage
// We only store the session private key and config - accounts are recreated on restore
export interface SerializedSession {
  config: Omit<SessionConfig, 'maxSpendUSDe'> & { maxSpendUSDe: string };
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address; // Public address of the session key
  ownerSignature: Hex; // Proves wallet ownership and session authorization
  createdAt: number;
}

// Session result with chain clients
export interface SessionResult {
  config: SessionConfig;
  etherealClient: KernelAccountClient<any, any, any>;
  arbitrumClient: KernelAccountClient<any, any, any>;
  serialized: SerializedSession;
}

// Owner signer interface (what we get from connected wallet)
export interface OwnerSigner {
  address: Address;
  signMessage: (args: { message: string | { raw: Hex } }) => Promise<Hex>;
  signTypedData?: (args: {
    domain: any;
    types: any;
    primaryType: string;
    message: any;
  }) => Promise<Hex>;
}

/**
 * Calculate the smart account address for a given owner address.
 * This doesn't require any signatures - just computes the counterfactual address.
 */
export async function getSmartAccountAddress(ownerAddress: Address): Promise<Address> {
  const publicClient = createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
    chain: arbitrum,
  });

  const emptyAccount = addressToEmptyAccount(ownerAddress);
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: emptyAccount,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  return account.address;
}

/**
 * Helper to create session accounts and clients from a private key and owner address.
 * Used by both createSession and restoreSession.
 */
async function buildSessionClients(
  sessionPrivateKey: Hex,
  ownerAddress: Address,
  maxSpendUSDe: bigint
): Promise<{
  etherealClient: KernelAccountClient<any, any, any>;
  arbitrumClient: KernelAccountClient<any, any, any>;
  smartAccountAddress: Address;
}> {
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  // Create session key signer
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Create public clients for both chains
  const etherealPublicClient = createPublicClient({
    transport: http(ethereal.rpcUrls.default.http[0]),
    chain: ethereal,
  });

  const arbitrumPublicClient = createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
    chain: arbitrum,
  });

  // For omnichain session keys, we use addressToEmptyAccount for the sudo validator
  const emptyOwnerAccount = addressToEmptyAccount(ownerAddress);

  // Create ECDSA validators for owner on both chains
  const etherealEcdsaValidator = await signerToEcdsaValidator(etherealPublicClient, {
    signer: emptyOwnerAccount,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const arbitrumEcdsaValidator = await signerToEcdsaValidator(arbitrumPublicClient, {
    signer: emptyOwnerAccount,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // Create sudo policy (allow all operations - spending limit hook will restrict)
  const sudoPolicy = toSudoPolicy({});

  // Create permission plugins for both chains
  const etherealPermissionPlugin = await toPermissionValidator(etherealPublicClient, {
    entryPoint: ENTRY_POINT,
    signer: sessionKeySigner,
    policies: [sudoPolicy],
    kernelVersion: KERNEL_VERSION,
  });

  const arbitrumPermissionPlugin = await toPermissionValidator(arbitrumPublicClient, {
    entryPoint: ENTRY_POINT,
    signer: sessionKeySigner,
    policies: [sudoPolicy],
    kernelVersion: KERNEL_VERSION,
  });

  // Create spending limit hook for WUSDe on Ethereal
  const spendingLimitHook = await toSpendingLimitHook({
    limits: [
      {
        token: WUSDE_ADDRESS_ETHEREAL,
        allowance: maxSpendUSDe,
      },
    ],
  });

  // Create kernel accounts with session keys
  const etherealSessionAccount = await createKernelAccount(etherealPublicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: etherealEcdsaValidator,
      regular: etherealPermissionPlugin,
      hook: spendingLimitHook,
    },
    kernelVersion: KERNEL_VERSION,
  });

  const arbitrumSessionAccount = await createKernelAccount(arbitrumPublicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: arbitrumEcdsaValidator,
      regular: arbitrumPermissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  // Create kernel clients
  const etherealClient = await createChainClient(ethereal, etherealSessionAccount);
  const arbitrumClient = await createChainClient(arbitrum, arbitrumSessionAccount);

  return {
    etherealClient,
    arbitrumClient,
    smartAccountAddress: etherealSessionAccount.address,
  };
}

/**
 * Create a session authorization message for the owner to sign.
 * This proves the owner controls the wallet and authorizes the session.
 */
export function createSessionAuthMessage(params: {
  sessionKeyAddress: Address;
  smartAccountAddress: Address;
  ownerAddress: Address;
  maxSpendUSDe: bigint;
  expiresAt: number;
}): string {
  const { sessionKeyAddress, smartAccountAddress, ownerAddress, maxSpendUSDe, expiresAt } = params;
  const expiresDate = new Date(expiresAt).toISOString();
  const spendLimit = (maxSpendUSDe / BigInt(10 ** 18)).toString();

  return `Sapience Session Authorization

I authorize this session key to act on behalf of my smart account.

Session Key: ${sessionKeyAddress}
Smart Account: ${smartAccountAddress}
Owner Wallet: ${ownerAddress}
Spending Limit: ${spendLimit} USDe
Expires: ${expiresDate}

This signature proves I control the owner wallet and authorize this session.`;
}

/**
 * Create a new session with spending limits.
 * Requires the owner to sign a message proving they control the wallet.
 */
export async function createSession(
  ownerSigner: OwnerSigner,
  durationHours: number,
  maxSpendUSDe: bigint
): Promise<SessionResult> {
  // Generate session private key
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  // Calculate expiration
  const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;

  // Get smart account address first (needed for the auth message)
  const smartAccountAddress = await getSmartAccountAddress(ownerSigner.address);

  // Create authorization message
  const authMessage = createSessionAuthMessage({
    sessionKeyAddress: sessionKeyAccount.address,
    smartAccountAddress,
    ownerAddress: ownerSigner.address,
    maxSpendUSDe,
    expiresAt,
  });

  // Request owner signature to prove wallet ownership and authorize session
  console.debug('[SessionKeyManager] Requesting owner signature for session authorization...');
  const ownerSignature = await ownerSigner.signMessage({ message: authMessage });
  console.debug('[SessionKeyManager] Owner signature obtained');

  // Build session clients
  const { etherealClient, arbitrumClient } = await buildSessionClients(
    sessionPrivateKey,
    ownerSigner.address,
    maxSpendUSDe
  );

  const config: SessionConfig = {
    durationHours,
    maxSpendUSDe,
    expiresAt,
    ownerAddress: ownerSigner.address,
    smartAccountAddress,
  };

  const serialized: SerializedSession = {
    config: {
      ...config,
      maxSpendUSDe: maxSpendUSDe.toString(),
    },
    sessionPrivateKey,
    sessionKeyAddress: sessionKeyAccount.address,
    ownerSignature,
    createdAt: Date.now(),
  };

  return {
    config,
    etherealClient,
    arbitrumClient,
    serialized,
  };
}

/**
 * Restore a session from serialized data.
 */
export async function restoreSession(serialized: SerializedSession): Promise<SessionResult> {
  // Check if session has expired
  if (Date.now() > serialized.config.expiresAt) {
    throw new Error('Session has expired');
  }

  const config: SessionConfig = {
    ...serialized.config,
    maxSpendUSDe: BigInt(serialized.config.maxSpendUSDe),
  };

  // Rebuild session clients from stored private key
  const { etherealClient, arbitrumClient } = await buildSessionClients(
    serialized.sessionPrivateKey,
    config.ownerAddress,
    config.maxSpendUSDe
  );

  return {
    config,
    etherealClient,
    arbitrumClient,
    serialized,
  };
}

/**
 * Create a kernel client for a specific chain.
 */
async function createChainClient(
  chain: Chain,
  account: Awaited<ReturnType<typeof createKernelAccount>>
): Promise<KernelAccountClient<any, any, any>> {
  const { bundlerUrl, paymasterUrl } = getZeroDevUrls(chain.id);

  const paymasterClient = createZeroDevPaymasterClient({
    chain,
    transport: http(paymasterUrl),
  });

  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: {
      getPaymasterData: async (userOperation) => {
        return paymasterClient.sponsorUserOperation({ userOperation });
      },
    },
  });
}

/**
 * Storage key for session data.
 */
export const SESSION_STORAGE_KEY = 'sapience:session';

/**
 * Save session to localStorage.
 */
export function saveSession(serialized: SerializedSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(serialized));
}

/**
 * Load session from localStorage.
 */
export function loadSession(): SerializedSession | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as SerializedSession;

    // Check if expired
    if (Date.now() > parsed.config.expiresAt) {
      clearSession();
      return null;
    }

    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

/**
 * Clear session from localStorage.
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
