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
  addressToEmptyAccount, // Still needed for getSmartAccountAddress
  type KernelAccountClient,
} from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import {
  toPermissionValidator,
  deserializePermissionAccount,
} from '@zerodev/permissions';
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
// We store ZeroDev approval strings which embed owner's EIP-712 signature
export interface SerializedSession {
  config: Omit<SessionConfig, 'maxSpendUSDe'> & { maxSpendUSDe: string };
  sessionPrivateKey: Hex;
  sessionKeyAddress: Address; // Public address of the session key
  createdAt: number;
  // ZeroDev approval strings (includes owner's enable signature)
  etherealApproval: string;
  arbitrumApproval: string;
}

// Session result with chain clients
export interface SessionResult {
  config: SessionConfig;
  etherealClient: KernelAccountClient<any, any, any>;
  arbitrumClient: KernelAccountClient<any, any, any>;
  serialized: SerializedSession;
}

// Owner signer interface (what we get from connected wallet)
// The provider should be an EIP-1193 compatible Ethereum provider
export interface OwnerSigner {
  address: Address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any; // EIP-1193 provider - ZeroDev accepts this via toSigner
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

// Public clients are created once and reused
function getPublicClients() {
  const etherealPublicClient = createPublicClient({
    transport: http(ethereal.rpcUrls.default.http[0]),
    chain: ethereal,
  });

  const arbitrumPublicClient = createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
    chain: arbitrum,
  });

  return { etherealPublicClient, arbitrumPublicClient };
}

/**
 * Create a new session with spending limits.
 * Uses ZeroDev's serializePermissionAccount to capture owner's EIP-712 approval.
 * The owner will be prompted to sign EIP-712 typed data messages for each chain.
 */
export async function createSession(
  ownerSigner: OwnerSigner,
  durationHours: number,
  maxSpendUSDe: bigint
): Promise<SessionResult> {
  console.debug('[SessionKeyManager] Creating new session...');

  // Generate session private key
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  // Create session key signer for ZeroDev
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Calculate expiration
  const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;

  // Get public clients
  const { etherealPublicClient, arbitrumPublicClient } = getPublicClients();

  // Create ECDSA validators for owner on both chains
  // Use the EIP-1193 provider so ZeroDev can request signatures
  const etherealOwnerValidator = await signerToEcdsaValidator(etherealPublicClient, {
    signer: ownerSigner.provider,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  const arbitrumOwnerValidator = await signerToEcdsaValidator(arbitrumPublicClient, {
    signer: ownerSigner.provider,
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
  const etherealAccount = await createKernelAccount(etherealPublicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: etherealOwnerValidator,
      regular: etherealPermissionPlugin,
      hook: spendingLimitHook,
    },
    kernelVersion: KERNEL_VERSION,
  });

  const arbitrumAccount = await createKernelAccount(arbitrumPublicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: arbitrumOwnerValidator,
      regular: arbitrumPermissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  const smartAccountAddress = etherealAccount.address;
  console.debug('[SessionKeyManager] Smart account address:', smartAccountAddress);

  // Serialize accounts with approval - triggers owner's EIP-712 signature for each chain
  console.debug('[SessionKeyManager] Requesting owner approval for session keys...');

  // Serialize each chain's account separately (owner will sign for each)
  const { serializePermissionAccount } = await import('@zerodev/permissions');

  const etherealApproval = await serializePermissionAccount(
    etherealAccount,
    sessionPrivateKey
  );

  const arbitrumApproval = await serializePermissionAccount(
    arbitrumAccount,
    sessionPrivateKey
  );

  console.debug('[SessionKeyManager] Owner approval obtained, session created');

  // Create kernel clients for immediate use
  const etherealClient = await createChainClient(ethereal, etherealAccount);
  const arbitrumClient = await createChainClient(arbitrum, arbitrumAccount);

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
    createdAt: Date.now(),
    etherealApproval,
    arbitrumApproval,
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
 * Uses ZeroDev's deserializePermissionAccount to restore accounts from approval strings.
 */
export async function restoreSession(serialized: SerializedSession): Promise<SessionResult> {
  // Check if session has expired
  if (Date.now() > serialized.config.expiresAt) {
    throw new Error('Session has expired');
  }

  console.debug('[SessionKeyManager] Restoring session...');

  const config: SessionConfig = {
    ...serialized.config,
    maxSpendUSDe: BigInt(serialized.config.maxSpendUSDe),
  };

  // Get public clients
  const { etherealPublicClient, arbitrumPublicClient } = getPublicClients();

  // Recreate session key signer from stored private key
  const sessionKeyAccount = privateKeyToAccount(serialized.sessionPrivateKey);
  const sessionKeySigner = await toECDSASigner({
    signer: sessionKeyAccount,
  });

  // Deserialize accounts from stored approvals
  // ZeroDev validates the enable signature internally
  const etherealAccount = await deserializePermissionAccount(
    etherealPublicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.etherealApproval,
    sessionKeySigner
  );

  const arbitrumAccount = await deserializePermissionAccount(
    arbitrumPublicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serialized.arbitrumApproval,
    sessionKeySigner
  );

  console.debug('[SessionKeyManager] Session restored, creating clients...');

  // Create kernel clients
  const etherealClient = await createChainClient(ethereal, etherealAccount);
  const arbitrumClient = await createChainClient(arbitrum, arbitrumAccount);

  console.debug('[SessionKeyManager] Session restoration complete');

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

    // Migration: Clear old sessions without ZeroDev approval
    // Old sessions used ownerSignature instead of approval strings
    if (!parsed.etherealApproval || !parsed.arbitrumApproval) {
      console.debug('[SessionKeyManager] Clearing old session format (missing approvals)');
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
