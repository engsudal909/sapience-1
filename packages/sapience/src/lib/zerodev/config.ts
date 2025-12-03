/**
 * ZeroDev Configuration
 *
 * Environment variables needed:
 * - NEXT_PUBLIC_ZERODEV_PROJECT_ID: Your ZeroDev project ID from dashboard.zerodev.app
 *
 * Chain-specific bundler/paymaster URLs are constructed from the project ID.
 * ZeroDev supports most EVM chains including Arbitrum, Base, and custom chains.
 */

import { arbitrum } from 'viem/chains';
import type { Chain } from 'viem';

// ZeroDev Project ID from environment
export const ZERODEV_PROJECT_ID =
  process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID || '';

// Ethereal chain definition
const ethereal = {
  id: 5064014,
  name: 'Ethereal',
  nativeCurrency: {
    decimals: 18,
    name: 'USDe',
    symbol: 'USDe',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.ethereal.trade'],
    },
    public: {
      http: ['https://rpc.ethereal.trade'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Ethereal Explorer',
      url: 'https://explorer.ethereal.trade',
    },
  },
} as const satisfies Chain;

// Supported chains for ZeroDev smart accounts
export const ZERODEV_SUPPORTED_CHAIN_IDS = [
  42161, // Arbitrum One
  5064014, // Ethereal
] as const;

export type ZeroDevSupportedChainId =
  (typeof ZERODEV_SUPPORTED_CHAIN_IDS)[number];

/**
 * Check if a chain is supported by ZeroDev
 */
export function isZeroDevSupported(chainId: number): boolean {
  return (ZERODEV_SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
}

/**
 * Get chain object for ZeroDev
 */
export function getZeroDevChain(chainId: number): Chain | null {
  switch (chainId) {
    case 42161:
      return arbitrum;
    case 5064014:
      return ethereal;
    default:
      return null;
  }
}

/**
 * Get ZeroDev bundler RPC URL for a chain
 * Format: https://rpc.zerodev.app/api/v3/bundler/{projectId}?chainId={chainId}
 */
export function getBundlerRpc(chainId: number): string {
  if (!ZERODEV_PROJECT_ID) {
    console.warn('[ZeroDev] No project ID configured');
    return '';
  }
  return `https://rpc.zerodev.app/api/v3/bundler/${ZERODEV_PROJECT_ID}?chainId=${chainId}`;
}

/**
 * Get ZeroDev paymaster RPC URL for a chain (for gas sponsorship)
 * Format: https://rpc.zerodev.app/api/v3/paymaster/{projectId}?chainId={chainId}
 */
export function getPaymasterRpc(chainId: number): string {
  if (!ZERODEV_PROJECT_ID) {
    return '';
  }
  return `https://rpc.zerodev.app/api/v3/paymaster/${ZERODEV_PROJECT_ID}?chainId=${chainId}`;
}

/**
 * Session key configuration defaults
 */
export const SESSION_KEY_DEFAULTS = {
  /** Default session duration in seconds (24 hours) */
  durationSeconds: 24 * 60 * 60,
  /** Maximum session duration in seconds (7 days) */
  maxDurationSeconds: 7 * 24 * 60 * 60,
} as const;

/**
 * Kernel version configuration
 * - EntryPoint v0.6: KernelVersion >= 0.2.2 and <= 0.2.4
 * - EntryPoint v0.7: KernelVersion >= 0.3.0
 */
export const KERNEL_VERSION = '0.3.0';
