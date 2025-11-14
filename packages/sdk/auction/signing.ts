import {
  encodeAbiParameters,
  keccak256,
  getAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface AuctionStartLike {
  wager: bigint | string;
  predictedOutcomes: Hex[]; // bytes[] (non-empty expected)
  resolver: Address;
  taker: Address;
  takerNonce: number;
  chainId: number;
  marketContract: Address;
}


/**
 * Build EIP‑712 typed data for a maker bid using the new auction payload.
 * Domain: { name: 'SignatureProcessor', version: '1', chainId: auction.chainId, verifyingContract: uniqueVerifier }
 * Message hash: keccak256(encodeAbiParameters([bytes32 predictionsHash, uint256 makerWager, uint256 makerDeadline]))
 */
export function buildMakerBidTypedData(args: {
  auction: AuctionStartLike;
  makerWager: bigint;
  makerDeadline: bigint | number;
  chainId: number;
  verifyingContract: Address;
  maker: Address;
}): {
  domain: TypedDataDomain;
  types: { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
} {
  if (args.auction.predictedOutcomes.length === 0) {
    throw new Error('predictedOutcomes must be non-empty');
  }

  // NOTE: Only the first element is used intentionally. The relayer encodes all legs
  // into a single bytes blob at index 0 for compatibility with the on-chain verifier.
  const encodedPredictedOutcomes = args.auction.predictedOutcomes[0];

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
      args.makerWager,
      typeof args.auction.wager === 'bigint' ? args.auction.wager : BigInt(args.auction.wager),
      args.auction.resolver,
      args.auction.taker,
      typeof args.makerDeadline === 'bigint' ? args.makerDeadline : BigInt(args.makerDeadline),
    ],
  );

  const messageHash = keccak256(inner);

  const domain = {
    name: 'SignatureProcessor',
    version: '1',
    chainId: args.chainId,
    verifyingContract: args.verifyingContract,
  } as const;
  
  const types = {
    Approve: [
      { name: 'messageHash', type: 'bytes32' },
      { name: 'owner', type: 'address' },
    ] as const,
  } as const satisfies { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };

  const message = {
    messageHash,
    owner: getAddress(args.maker),
  } as const;

  return {
    domain,
    types,
    primaryType: 'Approve',
    message,
  };
}

export async function signMakerBid(args: {
  privateKey: Hex;
  domain: TypedDataDomain;
  types: { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
}): Promise<Hex> {
  const account = privateKeyToAccount(args.privateKey);
  const signature = (await account.signTypedData({
    domain: args.domain,
    types: args.types,
    primaryType: args.primaryType,
    message: args.message,
  })) as Hex;
  return signature;
}


