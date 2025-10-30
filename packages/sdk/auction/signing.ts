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
  wager: string; // wei string
  predictedOutcomes: string[]; // bytes[]
  resolver: Address;
  maker: Address;
}

export function buildTakerBidTypedData(args: {
  auction: AuctionStartLike;
  takerWager: bigint;
  takerDeadline: number;
  chainId: number;
  verifyingContract: Address;
  taker: Address;
}): {
  domain: TypedDataDomain;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
} {
  const encodedPredictedOutcomes = args.auction
    .predictedOutcomes[0] as Hex;

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
      args.takerWager,
      BigInt(args.auction.wager),
      args.auction.resolver,
      args.auction.maker,
      BigInt(args.takerDeadline),
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
    ],
  } as const;

  const message = {
    messageHash,
    owner: getAddress(args.taker),
  } as const;

  return {
    domain,
    types: types as unknown as Record<string, Array<{ name: string; type: string }>>,
    primaryType: 'Approve',
    message,
  };
}

export async function signTakerBid(args: {
  privateKey: Hex;
  domain: TypedDataDomain;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
}): Promise<Hex> {
  const account = privateKeyToAccount(args.privateKey);
  const signature = (await account.signTypedData({
    domain: args.domain,
    types: args.types as any,
    primaryType: args.primaryType,
    message: args.message as any,
  })) as Hex;
  return signature;
}


