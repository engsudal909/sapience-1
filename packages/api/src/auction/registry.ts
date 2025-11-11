import { BidPayload, ValidatedBid, AuctionRequestPayload } from './types';
import { verifyMakerBid, normalizeAuctionPayload } from './helpers';
import { encodeAbiParameters, keccak256 } from 'viem';

interface AuctionRecord {
  auction: AuctionRequestPayload;
  bids: ValidatedBid[];
  deadlineMs: number; // absolute epoch ms after which auction expires
}

const auctions = new Map<string, AuctionRecord>();

// Ranking algorithm removed - UI will select best bid based on highest taker collateral

export function upsertAuction(auction: AuctionRequestPayload): string {
  // Deterministic ID incorporating predictionsHash and key auction fields
  const { predictionsHash } = normalizeAuctionPayload(auction);
  const idHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' }, // chainId
        { type: 'address' }, // marketContract
        { type: 'uint256' }, // wager
        { type: 'address' }, // taker
        { type: 'uint256' }, // takerNonce
        { type: 'bytes32' }, // predictionsHash
      ],
      [
        BigInt(auction.chainId),
        auction.marketContract as `0x${string}`,
        BigInt(auction.wager),
        auction.taker as `0x${string}`,
        BigInt(auction.takerNonce),
        predictionsHash,
      ]
    )
  );
  const auctionId = idHash;
  const ttl = 60_000; // default 60s
  const deadlineMs = Date.now() + Math.max(5_000, Math.min(ttl, 5 * 60_000));
  const existing = auctions.get(auctionId);
  if (existing) {
    // Do not overwrite existing bids or payload; just refresh deadline (extend)
    existing.deadlineMs = Math.max(existing.deadlineMs, deadlineMs);
    auctions.set(auctionId, existing);
    return auctionId;
  }
  auctions.set(auctionId, { auction, bids: [], deadlineMs });
  return auctionId;
}

export function getAuction(auctionId: string): AuctionRecord | undefined {
  const rec = auctions.get(auctionId);
  if (!rec) return undefined;
  if (Date.now() > rec.deadlineMs) {
    auctions.delete(auctionId);
    return undefined;
  }
  return rec;
}

export function addBid(
  auctionId: string,
  bid: BidPayload
): ValidatedBid | undefined {
  const rec = getAuction(auctionId);
  if (!rec) return undefined;

  // Validate passed-in fields and signature
  const verification = verifyMakerBid({
    auctionId,
    maker: bid.maker,
    makerWager: bid.makerWager,
    makerDeadline: bid.makerDeadline,
    makerSignature: bid.makerSignature,
  });
  if (!verification.ok) return undefined;

  const validated: ValidatedBid = { ...bid };
  rec.bids.push(validated);
  // Keep all bids - UI will select the best one
  auctions.set(auctionId, rec);
  return validated;
}

export function getBids(auctionId: string): ValidatedBid[] {
  const rec = getAuction(auctionId);
  return rec?.bids ?? [];
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id, rec] of auctions.entries()) {
    if (now > rec.deadlineMs) {
      auctions.delete(id);
    }
  }
}, 30_000).unref?.();
