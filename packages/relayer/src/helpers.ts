import type { AuctionRequestPayload, BidPayload } from './types';
import {
  encodeAbiParameters,
  keccak256,
  verifyTypedData,
  hashTypedData,
  recoverTypedDataAddress,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { computeSmartAccountAddress } from './smartAccount';
import { verifySessionApproval, type SessionApprovalPayload } from './sessionAuth';

/**
 * Helper function to create MintParlayRequestData for the ParlayPool.mint() function
 * This matches the struct defined in the Solidity contract
 */
export interface MintParlayRequestData {
  taker: string;
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  resolver: string;
  wager: string;
  takerCollateral: string;
  // Note: ERC-20 approvals are handled off-chain by maker and taker separately
}

/**
 * Creates the MintParlayRequestData struct for the ParlayPool.mint() function
 */
export function createMintParlayRequestData(
  auction: AuctionRequestPayload,
  taker: string,
  takerCollateral: string
): MintParlayRequestData {
  if (!auction.resolver) {
    throw new Error('Auction must have a resolver address');
  }

  return {
    taker: taker,
    predictedOutcomes: auction.predictedOutcomes,
    resolver: auction.resolver,
    wager: auction.wager,
    takerCollateral: takerCollateral,
  };
}

/**
 * Validates that an Auction has all required fields for the mint flow
 */
export function validateAuctionForMint(auction: AuctionRequestPayload): {
  valid: boolean;
  error?: string;
} {
  if (!auction.wager || BigInt(auction.wager) <= 0n) {
    return { valid: false, error: 'Invalid wager' };
  }
  if (!auction.predictedOutcomes || auction.predictedOutcomes.length === 0) {
    return { valid: false, error: 'No predicted outcomes' };
  }
  // chainId must be a finite positive number
  if (
    typeof auction.chainId !== 'number' ||
    !Number.isFinite(auction.chainId) ||
    auction.chainId <= 0
  ) {
    return { valid: false, error: 'Invalid chainId' };
  }
  // resolver must be a 0x address
  if (
    typeof auction.resolver !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(auction.resolver)
  ) {
    return { valid: false, error: 'Invalid resolver address' };
  }
  if (!auction.taker) {
    return { valid: false, error: 'Missing taker address' };
  }

  // Basic taker address validation (0x-prefixed 40-hex)
  if (
    typeof auction.taker !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(auction.taker)
  ) {
    return { valid: false, error: 'Invalid taker address' };
  }
  // takerNonce must be a finite number
  if (
    typeof auction.takerNonce !== 'number' ||
    !Number.isFinite(auction.takerNonce) ||
    auction.takerNonce < 0
  ) {
    return { valid: false, error: 'Invalid takerNonce' };
  }

  // Validate predicted outcomes are non-empty bytes strings
  for (const outcome of auction.predictedOutcomes) {
    if (!outcome || typeof outcome !== 'string' || outcome.length === 0) {
      return {
        valid: false,
        error: 'Invalid predicted outcome: must be non-empty bytes string',
      };
    }
  }

  return { valid: true };
}

/**
 * Calculates the expected payout for a parlay (wager + taker collateral)
 */
export function calculateExpectedPayout(
  wager: string,
  takerCollateral: string
): string {
  const wagerAmount = BigInt(wager);
  const takerAmount = BigInt(takerCollateral);
  return (wagerAmount + takerAmount).toString();
}

/**
 * Validates that a bid's payout matches the expected payout
 */
export function validatePayout(
  wager: string,
  takerCollateral: string,
  bidPayout: string
): boolean {
  const expectedPayout = calculateExpectedPayout(wager, takerCollateral);
  return BigInt(bidPayout) === BigInt(expectedPayout);
}

/**
 * Creates a standardized error message for common validation failures
 */
export function createValidationError(
  reason: string,
  context?: Record<string, unknown>
): string {
  const baseMessage = `Validation failed: ${reason}`;
  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    return `${baseMessage} (${contextStr})`;
  }
  return baseMessage;
}

/**
 * Verifies a maker bid using a typed payload scheme (e.g., EIP-712 or personal_sign preimage).
 * This function currently does structural checks only; wire in real signature recovery for production.
 */
export function verifyMakerBid(params: {
  auctionId: string;
  maker: string;
  makerWager: string;
  makerDeadline: number;
  makerSignature: string;
}): { ok: boolean; reason?: string } {
  try {
    const { auctionId, maker, makerWager, makerDeadline, makerSignature } =
      params;
    if (!auctionId || typeof auctionId !== 'string') {
      return { ok: false, reason: 'invalid_auction_id' };
    }
    if (typeof maker !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(maker)) {
      return { ok: false, reason: 'invalid_maker' };
    }
    if (!makerWager || BigInt(makerWager) <= 0n) {
      return { ok: false, reason: 'invalid_maker_wager' };
    }
    if (
      typeof makerDeadline !== 'number' ||
      !Number.isFinite(makerDeadline) ||
      makerDeadline <= Math.floor(Date.now() / 1000)
    ) {
      return { ok: false, reason: 'quote_expired' };
    }
    if (
      typeof makerSignature !== 'string' ||
      !makerSignature.startsWith('0x') ||
      makerSignature.length < 10
    ) {
      return { ok: false, reason: 'invalid_maker_bid_signature_format' };
    }

    // TODO: Implement real signature verification (EIP-712) against the exact typed payload
    // For now, treat format-valid signatures as acceptable.
    return { ok: true };
  } catch {
    return { ok: false, reason: 'verification_failed' };
  }
}

/**
 * Strictly verifies a maker bid signature using EIP-712 typed data.
 *
 * Verification flow:
 * 1. If sessionApproval is present: verify the ZeroDev session approval
 * 2. Try direct verification against maker address (works for EOAs)
 * 3. If fails, recover signer and compute their smart account, verify it matches maker
 *
 * This approach:
 * - Requires no on-chain calls (fully deterministic)
 * - Works for EOAs, deployed smart accounts, and counterfactual smart accounts
 * - Supports ZeroDev session keys for smart account authentication
 */
export async function verifyMakerBidStrict(params: {
  auction: AuctionRequestPayload;
  bid: BidPayload;
  chainId: number;
  verifyingContract: `0x${string}`;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { auction, bid, chainId, verifyingContract } = params;

    // Basic guards
    if (!auction || !bid) return { ok: false, reason: 'invalid_payload' };
    if (!auction.predictedOutcomes?.length)
      return { ok: false, reason: 'invalid_auction_outcomes' };

    const makerAddress = getAddress(bid.maker) as Address;
    const signature = bid.makerSignature as Hex;

    // Path 1: If session approval is present, verify via ZeroDev session
    if (bid.sessionApproval) {
      const sessionApprovalPayload: SessionApprovalPayload = {
        approval: bid.sessionApproval,
        chainId,
        typedData: bid.sessionTypedData,
      };

      const sessionResult = await verifySessionApproval(
        sessionApprovalPayload,
        makerAddress
      );

      if (sessionResult.valid) {
        // Session approval is valid - the session key signed the bid
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Helpers] Valid session approval for maker:', makerAddress);
        }
        return { ok: true };
      } else {
        console.warn('[Helpers] Session approval verification failed:', sessionResult.error);
        // Fall through to try other verification methods
      }
    }

    const encodedPredictedOutcomes = auction
      .predictedOutcomes[0] as `0x${string}`;

    // Hash the inner message per contract
    const inner = encodeAbiParameters(
      [
        { type: 'bytes' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      [
        encodedPredictedOutcomes,
        BigInt(bid.makerWager),
        BigInt(auction.wager),
        auction.resolver as `0x${string}`,
        auction.taker as `0x${string}`,
        BigInt(bid.makerDeadline),
      ]
    );

    const messageHash = keccak256(inner);

    // EIP-712 domain and types must match SignatureProcessor
    const domain = {
      name: 'SignatureProcessor',
      version: '1',
      chainId,
      verifyingContract,
    } as const;

    const types = {
      Approve: [
        { name: 'messageHash', type: 'bytes32' },
        { name: 'owner', type: 'address' },
      ],
    } as const;

    const message = {
      messageHash,
      owner: makerAddress,
    } as const;

    // Path 2: Try direct EOA verification
    try {
      const isValidEOA = await verifyTypedData({
        address: makerAddress,
        domain,
        primaryType: 'Approve',
        types,
        message,
        signature,
      });

      if (isValidEOA) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Helpers] Valid EOA maker signature');
        }
        return { ok: true };
      }
    } catch {
      // EOA verification failed, continue to smart account check
    }

    // Path 3: Recover signer and verify they own the smart account
    const recoveredOwner = await recoverTypedDataAddress({
      domain,
      primaryType: 'Approve',
      types,
      message,
      signature,
    });

    const expectedSmartAccount = await computeSmartAccountAddress(recoveredOwner);

    if (expectedSmartAccount.toLowerCase() === makerAddress.toLowerCase()) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Helpers] Valid smart account owner signature for maker, owner:', recoveredOwner);
      }
      return { ok: true };
    }

    console.warn('[Helpers] Maker signature verification failed: recovered owner does not match maker smart account');
    return { ok: false, reason: 'invalid_signature' };
  } catch (error) {
    console.error('[Helpers] Maker bid verification failed:', error);
    return { ok: false, reason: 'verification_failed' };
  }
}
