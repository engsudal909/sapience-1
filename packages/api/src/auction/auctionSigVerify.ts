import { SiweMessage } from 'siwe';
import { AuctionRequestPayload } from './types';

const QUOTE_MESSAGE_PREFIX = 'Sign to get a quote';

/**
 * Creates a SIWE message for auction request signing
 * @param payload - The auction request payload
 * @param domain - The domain requesting the signature (e.g., 'api.example.com')
 * @param uri - The URI of the request (e.g., 'wss://api.example.com/auction')
 * @returns SIWE message string
 */
export function createAuctionSiweMessage(
  payload: Omit<AuctionRequestPayload, 'takerSignature' | 'takerSignedAt'>,
  domain: string,
  uri: string,
  issuedAt: string
): string {
  const nonce = payload.takerNonce.toString();

  // Create a statement that includes all auction-specific parameters
  // This must match the client implementation exactly
  const statement = [
    'Sign to get a quote',
    `Wager: ${payload.wager}`,
    `Outcomes: ${payload.predictedOutcomes.join(',')}`,
    `Resolver: ${payload.resolver}`
  ].join(' | ');

  // Manually construct the SIWE message following EIP-4361 format
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
 * Verifies the taker signature for an auction request
 * @param payload - The auction request payload including the signature
 * @param domain - The domain that was used in the original message
 * @param uri - The URI that was used in the original message
 * @returns true if signature is valid, false otherwise
 */
export async function verifyAuctionSignature(
  payload: AuctionRequestPayload,
  domain: string,
  uri: string
): Promise<boolean> {
  if (!payload.takerSignature || !payload.takerSignedAt) {
    return false;
  }

  try {
    // Reconstruct the message that should have been signed using the payload data + timestamp
    const reconstructedMessage = createAuctionSiweMessage(
      payload,
      domain,
      uri,
      payload.takerSignedAt
    );

    // Parse the reconstructed message
    const siweMessage = new SiweMessage(reconstructedMessage);

    // Verify the signature matches the message
    const result = await siweMessage.verify({
      signature: payload.takerSignature,
    });

    // Check if verification succeeded and address matches the taker
    if (!result.success || result.data.address.toLowerCase() !== payload.taker.toLowerCase()) {
      console.warn('[Auction-Sig] Signature verification failed or address mismatch');
      return false;
    }

    // Verify the message contains expected domain and nonce
    if (siweMessage.domain !== domain || siweMessage.nonce !== payload.takerNonce.toString()) {
      console.warn('[Auction-Sig] Domain or nonce mismatch in signed message');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Auction-Sig] Verification failed:', error);
    return false;
  }
}

/**
 * Helper to generate a message for the client to sign
 * This can be used by clients to know what to sign
 */
export function generateSigningMessage(
  payload: Omit<AuctionRequestPayload, 'takerSignature' | 'takerSignedAt'>,
  domain: string,
  uri: string,
  issuedAt?: string
): string {
  return createAuctionSiweMessage(payload, domain, uri, issuedAt || new Date().toISOString());
}

