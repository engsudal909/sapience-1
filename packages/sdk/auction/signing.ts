import {
  encodeAbiParameters,
  keccak256,
  getAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Normalized shape for the new auction payload used by the relayer.
 * The taker starts the auction and provides a canonical predictions[] array.
 */
export interface AuctionRequestLike {
  wager: bigint | string;
  taker: Address;
  takerNonce: number;
  chainId: number;
  marketContract: Address;
  predictions: {
    resolverContract: Address;
    predictedOutcome: Hex;
  }[];
}

/**
 * Normalize auction predictions and compute an order‑invariant predictionsHash.
 * Mirrors server semantics to ensure signatures are constructed identically client/server.
 */
export function normalizeAuctionPayload(auction: AuctionRequestLike): {
  predictions: {
    resolverContract: Address;
    predictedOutcome: Hex;
  }[];
  uniqueResolverContracts: Set<Address>;
  predictionsHash: Hex;
} {
  const predictions = (auction?.predictions ?? []).map((p) => ({
    resolverContract: getAddress(p?.resolverContract as Address),
    predictedOutcome: (p?.predictedOutcome || '0x') as Hex,
  }));

  // Canonical order: (resolver, predictedOutcomes)
  const sorted = [...predictions].sort((a, b) => {
    if (a.resolverContract !== b.resolverContract) return a.resolverContract < b.resolverContract ? -1 : 1;
    if (a.predictedOutcome !== b.predictedOutcome) return a.predictedOutcome < b.predictedOutcome ? -1 : 1;
    return 0;
  });

  const encoded = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'resolverContract', type: 'address' },
          { name: 'predictedOutcome', type: 'bytes' },
        ],
      },
    ],
    [
      sorted.map((p) => ({
        resolverContract: p.resolverContract,
        predictedOutcome: p.predictedOutcome,
      })),
    ]
  );

  const predictionsHash = keccak256(encoded) as Hex;
  const uniqueResolverContracts = new Set(sorted.map((p) => p.resolverContract));
  return {
    predictions,
    uniqueResolverContracts,
    predictionsHash,
  };
}

/**
 * Build EIP‑712 typed data for a maker bid using the new auction payload.
 * Domain: { name: 'SignatureProcessor', version: '1', chainId: auction.chainId, verifyingContract: uniqueVerifier }
 * Message hash: keccak256(encodeAbiParameters([bytes32 predictionsHash, uint256 makerWager, uint256 makerDeadline]))
 */
export function buildMakerBidTypedData(args: {
  auction: AuctionRequestLike;
  makerWager: bigint;
  makerDeadline: bigint | number;
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
  const { uniqueResolverContracts, predictionsHash } = normalizeAuctionPayload(args.auction);
  // Enforce single resolver across predictions for now
  if (uniqueResolverContracts.size !== 1) {
    throw new Error('CROSS_VERIFIER_UNSUPPORTED');
  }
  // Use the market contract as the EIP-712 verifying contract
  const verifierContract = getAddress(args.auction.marketContract);

  const inner = encodeAbiParameters(
    [
      { type: 'bytes32' }, // predictionsHash
      { type: 'uint256' }, // makerWager
      { type: 'uint256' }, // makerDeadline
    ],
    [
      predictionsHash,
      args.makerWager,
      typeof args.makerDeadline === 'bigint' ? args.makerDeadline : BigInt(args.makerDeadline),
    ]
  );

  const messageHash = keccak256(inner);

  const domain = {
    name: 'SignatureProcessor',
    version: '1',
    chainId: args.auction.chainId,
    verifyingContract: verifierContract,
  } as const;

  const types = {
    Approve: [
      { name: 'messageHash', type: 'bytes32' },
      { name: 'owner', type: 'address' },
    ] as const,
  } as const;

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


