import { useSettings } from '~/lib/context/SettingsContext';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

/**
 * Hook to read chainId from SettingsContext.
 * Formerly read from localStorage directly.
 *
 * @returns The current chainId, defaults to DEFAULT_CHAIN_ID (Arbitrum)
 */
export const useChainIdFromLocalStorage = (): number => {
  const { chainId } = useSettings();
  return chainId ?? DEFAULT_CHAIN_ID;
};
