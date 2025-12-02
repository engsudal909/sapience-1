import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import type { AuctionBidData } from '~/components/shared/AuctionBidsChart';

/**
 * Converts QuoteBid[] (from the parlay auction) to AuctionBidData[] format
 * suitable for the AuctionBidsChart component.
 *
 * The main difference is that QuoteBid doesn't include receivedAtMs,
 * so we estimate it based on the makerDeadline (assuming ~30s bid lifetime).
 */
export function quoteBidsToAuctionBids(bids: QuoteBid[]): AuctionBidData[] {
  const nowMs = Date.now();

  return bids.map((bid) => {
    // Estimate receivedAtMs: assume bids are typically valid for ~30 seconds
    // So receivedAt ≈ deadline - 30s, but cap at current time
    const deadlineMs = bid.makerDeadline * 1000;
    const estimatedReceivedAt = Math.min(deadlineMs - 30_000, nowMs);

    return {
      auctionId: bid.auctionId,
      maker: bid.maker,
      makerWager: bid.makerWager,
      makerDeadline: bid.makerDeadline,
      makerSignature: bid.makerSignature,
      makerNonce: bid.makerNonce,
      receivedAtMs: estimatedReceivedAt,
    };
  });
}

