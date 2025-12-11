import { verifyMessage } from 'viem';
import {
  createAuctionStartSiweMessage,
  type AuctionStartSigningPayload,
} from '@sapience/sdk';
import { AuctionRequestPayload } from './types';

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
    const signingPayload: AuctionStartSigningPayload = {
      wager: payload.wager,
      predictedOutcomes: payload.predictedOutcomes,
      resolver: payload.resolver,
      taker: payload.taker,
      takerNonce: payload.takerNonce,
      chainId: payload.chainId,
    };
    const reconstructedMessage = createAuctionStartSiweMessage(
      signingPayload,
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
  const signingPayload: AuctionStartSigningPayload = {
    wager: payload.wager,
    predictedOutcomes: payload.predictedOutcomes,
    resolver: payload.resolver,
    taker: payload.taker,
    takerNonce: payload.takerNonce,
    chainId: payload.chainId,
  };
  return createAuctionStartSiweMessage(
    signingPayload,
    domain,
    uri,
    issuedAt || new Date().toISOString()
  );
}
<<<<<<< HEAD:packages/auction-ws/src/auctionSigVerify.ts

=======
>>>>>>> main:packages/api/src/auction/auctionSigVerify.ts
