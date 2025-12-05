import { verifyMessage } from 'viem';
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

  // Create a compact statement that includes all auction-specific parameters
  // This must match the client implementation exactly
  // Encode auction params in the statement to keep it on one line
  const statement = `Sign to get a quote | Wager: ${payload.wager} | Outcomes: ${payload.predictedOutcomes.join(',')} | Resolver: ${payload.resolver}`;

  // Manually construct the SIWE message following EIP-4361 format
  // Must be exactly 6 lines to pass SIWE parser validation
  // Combine fields to meet the 6-line limit: domain+address, statement, URI+Version, Chain ID, Nonce, Issued At
  const preparedMessage = [
    `${domain} wants you to sign in with your Ethereum account:\n${payload.taker}`,
    statement,
    `URI: ${uri}\nVersion: 1`,
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
    // This matches exactly what the client creates and signs
    const reconstructedMessage = createAuctionSiweMessage(
      payload,
      domain,
      uri,
      payload.takerSignedAt
    );

    // Verify the signature directly using EIP-191 (same as client does)
    // This bypasses the SIWE parser which has strict validation rules
    const isValid = await verifyMessage({
      address: payload.taker.toLowerCase() as `0x${string}`,
      message: reconstructedMessage,
      signature: payload.takerSignature as `0x${string}`,
    });

    if (!isValid) {
      console.warn('[Auction-Sig] Signature verification failed');
      return false;
    }

    // Additional validation: verify the message contains expected values
    // We can do basic string checks since we constructed the message
    if (!reconstructedMessage.includes(`Nonce: ${payload.takerNonce}`)) {
      console.warn('[Auction-Sig] Nonce mismatch in signed message');
      return false;
    }

    if (!reconstructedMessage.includes(`Chain ID: ${payload.chainId}`)) {
      console.warn('[Auction-Sig] Chain ID mismatch in signed message');
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

