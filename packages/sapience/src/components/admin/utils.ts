import { CHAIN_ID_ARBITRUM } from './constants';

// Read chainId from localStorage
export const getChainIdFromLocalStorage = (): number => {
  if (typeof window === 'undefined') {
    console.log('[getChainIdFromLocalStorage] window is undefined, returning default:', CHAIN_ID_ARBITRUM);
    return CHAIN_ID_ARBITRUM;
  }
  try {
    const stored = window.localStorage.getItem('sapience.settings.chainId');
    console.log('[getChainIdFromLocalStorage] localStorage value:', stored);
    const parsed = stored ? parseInt(stored, 10) : CHAIN_ID_ARBITRUM;
    console.log('[getChainIdFromLocalStorage] parsed chainId:', parsed);
    return parsed;
  } catch (error) {
    console.error('[getChainIdFromLocalStorage] Error reading localStorage:', error);
    return CHAIN_ID_ARBITRUM;
  }
};
