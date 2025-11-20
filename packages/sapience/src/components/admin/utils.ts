import { CHAIN_ID_ARBITRUM } from './constants';
import { settingsStorage } from '~/lib/context/SettingsContext';

// Read chainId from settings storage
export const getChainIdFromLocalStorage = (): number => {
  if (typeof window === 'undefined') return CHAIN_ID_ARBITRUM;
  try {
    const stored = settingsStorage.read('chainId');
    return stored ? parseInt(stored, 10) : CHAIN_ID_ARBITRUM;
  } catch {
    return CHAIN_ID_ARBITRUM;
  }
};
