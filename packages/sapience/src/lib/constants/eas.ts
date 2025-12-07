// Chain-specific EAS explorer URLs
const EAS_EXPLORER_URLS: Record<number, string> = {
  8453: 'https://base.easscan.org', // Base
  432: '', // Converge - no EAS explorer yet
  1: 'https://easscan.org', // Ethereum mainnet
  11155111: 'https://sepolia.easscan.org', // Sepolia
  42161: 'https://arbitrum.easscan.org', // Arbitrum
};

// Schema: address resolver, bytes condition, uint256 forecast, string comment
export const SCHEMA_UID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';

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
