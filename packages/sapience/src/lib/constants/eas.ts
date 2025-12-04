// Chain-specific EAS explorer URLs
const EAS_EXPLORER_URLS: Record<number, string> = {
  8453: 'https://base.easscan.org', // Base
  432: '', // Converge - no EAS explorer yet
  1: 'https://easscan.org', // Ethereum mainnet
  11155111: 'https://sepolia.easscan.org', // Sepolia
  42161: 'https://arbitrum.easscan.org', // Arbitrum
};

// Schema: address marketAddress, uint256 marketId, address resolver, bytes condition, uint256 prediction, string comment
export const SCHEMA_UID =
  '0x6ad0b3db05192b2fc9cc02e4ca7e1faa76959037b96823eb83e2f711a395a21f';

// Utility functions
export const getEASExplorerURL = (chainId: number): string => {
  return EAS_EXPLORER_URLS[chainId] || '';
};

export const getAttestationViewURL = (
  chainId: number,
  attestationId: string
): string => {
  const baseUrl = getEASExplorerURL(chainId);
  return baseUrl ? `${baseUrl}/attestation/view/${attestationId}` : '';
};
