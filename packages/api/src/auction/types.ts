export type HexString = `0x${string}`;

export interface AuctionRequestPayload {
  wager: string; // wei string (single total wager across all predictions)
  predictions: {
    resolverContract: string; // resolver contract for market validation
    predictedOutcomes: string; // encoded outcomes blob this resolver understands
  }[]; // canonical shape (array of length >= 1; single-prediction is an array of one)
  taker: string; // EOA address of the taker initiating the auction
  takerNonce: number; // nonce for the taker
  chainId: number; // chain ID for the auction (e.g., 42161 for Arbitrum)
  marketContract: string; // primary market entrypoint for this auction flow
}

export interface BidQuote {
  takerDeadline: number; // unix seconds
}

export interface BidFillRawTx {
  rawSignedTx: HexString; // RLP
}

export interface BidFillCallData {
  callData: {
    to: string;
    data: HexString;
    gas?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: string;
  };
  signature?: {
    r: HexString;
    s: HexString;
    v: number;
  };
}

export interface MintParlayData {
  taker: string; // EOA
  takerWager: string; // wei string
  takerSignature: string; // Taker's signature allowing this specific bid
}

export type BidFill = BidFillRawTx | BidFillCallData | MintParlayData;

export interface BidPayload {
  auctionId: string;
  maker: string; // Maker's EOA address (0x...) - the bidding party
  makerWager: string; // wei string
  makerDeadline: number; // unix seconds
  makerSignature: string; // Maker's signature authorizing this specific bid over the typed payload
  makerNonce: number; // nonce for the maker (bidding party)
}

export type ValidatedBid = BidPayload;

export type ClientToServerMessage =
  | {
      type: 'auction.start';
      payload: AuctionRequestPayload;
    }
  | {
      type: 'auction.subscribe';
      payload: { auctionId: string };
    };

export type BotToServerMessage = { type: 'bid.submit'; payload: BidPayload };

export type ServerToClientMessage =
  | { type: 'auction.ack'; payload: { auctionId?: string; error?: string } }
  | { type: 'bid.ack'; payload: { error?: string } }
  | {
      type: 'auction.bids';
      payload: { auctionId: string; bids: ValidatedBid[] };
    }
  | {
      type: 'auction.started';
      payload: AuctionRequestPayload & { auctionId: string };
    };
