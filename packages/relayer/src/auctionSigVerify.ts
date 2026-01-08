import {
  verifyMessage,
  createPublicClient,
  http,
  hashMessage,
  type Address,
  type Hex,
} from 'viem';
import { arbitrum } from 'viem/chains';
import {
  createAuctionStartSiweMessage,
  type AuctionStartSigningPayload,
} from '@sapience/sdk';
import { AuctionRequestPayload, SessionMetadata } from './types';

// EIP-1271 magic value for valid signatures
const EIP1271_MAGIC_VALUE = '0x1626ba7e';

// EIP-1271 ABI for isValidSignature
const EIP1271_ABI = [
  {
    name: 'isValidSignature',
    type: 'function',
    inputs: [
      { name: 'hash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'magicValue', type: 'bytes4' }],
  },
] as const;

/**
 * Check if an address is a smart contract (has bytecode)
 */
async function isContract(address: Address): Promise<boolean> {
  const client = createPublicClient({
    chain: arbitrum,
    transport: http(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
  });

  try {
    const code = await client.getBytecode({ address });
    return code !== undefined && code !== '0x';
  } catch {
    return false;
  }
}

/**
 * Verify a signature using EIP-1271 smart contract verification
 */
async function verifySmartAccountSignature(
  contractAddress: Address,
  messageHash: Hex,
  signature: Hex
): Promise<boolean> {
  const client = createPublicClient({
    chain: arbitrum,
    transport: http(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
  });

  try {
    const result = await client.readContract({
      address: contractAddress,
      abi: EIP1271_ABI,
      functionName: 'isValidSignature',
      args: [messageHash, signature],
    });
    return result === EIP1271_MAGIC_VALUE;
  } catch (error) {
    console.error('[Auction-Sig] EIP-1271 verification failed:', error);
    return false;
  }
}

/**
 * Verify a session signature for an auction request.
 * ZeroDev's enable signature handles owner->session authorization,
 * so we only need to verify:
 * 1. Session not expired
 * 2. Session key signed the request
 */
async function verifySessionSignature(
  payload: AuctionRequestPayload,
  domain: string,
  uri: string,
  sessionMetadata: SessionMetadata
): Promise<boolean> {
  // 1. Check session not expired
  if (Date.now() > sessionMetadata.sessionExpiresAt) {
    console.warn('[Session-Sig] Session expired');
    return false;
  }

  // 2. Verify session key signed the request
  // Note: Owner authorization is handled by ZeroDev's enable signature,
  // which is validated when the session key submits UserOperations
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
    payload.takerSignedAt!
  );

  try {
    const sessionKeyValid = await verifyMessage({
      address: sessionMetadata.sessionKeyAddress as Address,
      message: reconstructedMessage,
      signature: payload.takerSignature as Hex,
    });

    if (!sessionKeyValid) {
      console.warn('[Session-Sig] Session key signature invalid');
      return false;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Session-Sig] Session key signature valid for smart account:', payload.taker);
    }

    return true;
  } catch (error) {
    console.error('[Session-Sig] Session key signature verification failed:', error);
    return false;
  }
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

  // If session metadata is present, use session verification path
  // This handles counterfactual smart accounts that aren't deployed yet
  if (payload.sessionMetadata) {
    return verifySessionSignature(payload, domain, uri, payload.sessionMetadata);
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

    // Check if taker is a smart contract (for EIP-1271 verification)
    const takerAddress = payload.taker.toLowerCase() as Address;
    const takerIsContract = await isContract(takerAddress);

    let isValid: boolean;
    if (takerIsContract) {
      // EIP-1271 smart contract signature verification
      const messageHash = hashMessage(reconstructedMessage);
      isValid = await verifySmartAccountSignature(
        takerAddress,
        messageHash,
        payload.takerSignature as Hex
      );
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Auction-Sig] Using EIP-1271 verification for smart account');
      }
    } else {
      // EOA signature verification (EIP-191)
      isValid = await verifyMessage({
        address: takerAddress,
        message: reconstructedMessage,
        signature: payload.takerSignature as `0x${string}`,
      });
    }

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
