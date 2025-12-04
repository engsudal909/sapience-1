import { SiweMessage } from 'siwe';

const QUOTE_MESSAGE_PREFIX = 'Sign to get a quote';

export interface AuctionSigningPayload {
  wager: string; // wei string
  predictedOutcomes: string[]; // Array of bytes strings
  resolver: string; // contract address
  taker: string; // EOA address
  takerNonce: number; // nonce
  chainId: number; // chain ID
}

/**
 * Creates a SIWE message for auction request signing
 * This must match the server's implementation in packages/api/src/auction/auctionSigVerify.ts
 */
export function createAuctionSiweMessage(
  payload: AuctionSigningPayload,
  domain: string,
  uri: string,
  issuedAt: string
): string {
  const nonce = payload.takerNonce.toString();

  // Create a statement that includes all auction-specific parameters
  // This ensures wager, predictedOutcomes, and resolver are part of the signature
  const statement = [
    'Sign to get a quote',
    `Wager: ${payload.wager}`,
    `Outcomes: ${payload.predictedOutcomes.join(',')}`,
    `Resolver: ${payload.resolver}`
  ].join(' | ');

  // Manually construct the SIWE message following EIP-4361 format
  // We do this instead of using SiweMessage constructor because SIWE 3.0.0
  // has validation issues when constructing from object params
  const preparedMessage = [
    `${domain} wants you to sign in with your Ethereum account:`,
    payload.taker,
    '',
    statement,
    '',
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: ${payload.chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`
  ].join('\n');

  return preparedMessage;
}

/**
 * Signs an auction request with SIWE (EIP-191)
 * @param payload - Auction parameters to sign
 * @param domain - The domain (e.g., 'api.sapience.xyz')
 * @param uri - The WebSocket URI (e.g., 'wss://api.sapience.xyz/auction')
 * @param signMessageFn - Function to sign the message (e.g., from wagmi's signMessageAsync)
 * @returns The signature string and the timestamp when it was signed
 */
export async function signAuctionRequest(
  payload: AuctionSigningPayload,
  domain: string,
  uri: string,
  signMessageFn: (args: { message: string }) => Promise<string>
): Promise<{ signature: string; issuedAt: string }> {
  const issuedAt = new Date().toISOString();
  const message = createAuctionSiweMessage(payload, domain, uri, issuedAt);
  const signature = await signMessageFn({ message });
  return { signature, issuedAt };
}

/**
 * Extracts domain and URI from a WebSocket URL for SIWE signing
 * @param wsUrl - WebSocket URL (e.g., 'wss://api.sapience.xyz/auction')
 * @returns { domain, uri } for SIWE message
 */
export function extractSiweDomainAndUri(wsUrl: string): {
  domain: string;
  uri: string;
} {
  try {
    const url = new URL(wsUrl);
    const domain = url.hostname;
    // Use origin instead of full URL to keep URI short
    const protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    const uri = `${protocol}//${url.host}`;
    return { domain, uri };
  } catch (err) {
    // Fallback for invalid URLs
    console.error('[AuctionSigning] Invalid WebSocket URL:', wsUrl, err);
    return { domain: 'unknown', uri: 'https://unknown' };
  }
}

