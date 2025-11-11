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
  // On-chain quantity in wei; accepts bigint for safety, or string for convenience
  wager: bigint | string;
  // Pre-encoded outcomes bytes. Only the first element is used because the relayer
  // provides a single aggregated blob containing all legs. Additional elements are ignored.
  predictedOutcomes: Hex[]; // bytes[] (non-empty expected)
  resolver: Address;
  maker: Address;
}

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
    verifierContract: Address;
    resolverContract: Address;
    predictedOutcomes: Hex;
  }[];
}

export function buildTakerBidTypedData(args: {
  auction: AuctionStartLike;
  takerWager: bigint;
  // Accept bigint for timestamp to avoid precision issues; number remains supported
  takerDeadline: bigint | number;
  chainId: number;
  verifierContract: Address;
  taker: Address;
}): {
  domain: TypedDataDomain;
  types: { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
} {
  // DEPRECATED path: maintained for backward compatibility with legacy relayer payloads
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
      args.takerWager,
      typeof args.auction.wager === 'bigint' ? args.auction.wager : BigInt(args.auction.wager),
      args.auction.resolver,
      args.auction.maker,
      typeof args.takerDeadline === 'bigint' ? args.takerDeadline : BigInt(args.takerDeadline),
    ],
  );

  const messageHash = keccak256(inner);

  const domain = {
    name: 'SignatureProcessor',
    version: '1',
    chainId: args.chainId,
    verifyingContract: args.verifierContract,
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
    owner: getAddress(args.taker),
  } as const;

  // NOTE: The primaryType 'Approve' is required for compatibility with the on-chain
  // SignatureProcessor. Renaming this will change the struct hash and invalidate signatures.
  return {
    domain,
    types,
    primaryType: 'Approve',
    message,
  };
}

export async function signTakerBid(args: {
  privateKey: Hex;
  domain: TypedDataDomain;
  types: { Approve: readonly [
    { name: 'messageHash'; type: 'bytes32' },
    { name: 'owner'; type: 'address' },
  ] };
  primaryType: 'Approve';
  message: { messageHash: Hex; owner: Address };
}): Promise<Hex> {
  // DEPRECATED path: maintained for backward compatibility
  const account = privateKeyToAccount(args.privateKey);
  const signature = (await account.signTypedData({
    domain: args.domain,
    types: args.types,
    primaryType: args.primaryType,
    message: args.message,
  })) as Hex;
  return signature;
}

/**
 * Normalize auction predictions and compute an order‑invariant predictionsHash.
 * Mirrors server semantics to ensure signatures are constructed identically client/server.
 */
export function normalizeAuctionPayload(auction: AuctionRequestLike): {
  predictions: {
    verifierContract: Address;
    resolverContract: Address;
    predictedOutcomes: Hex;
  }[];
  uniqueVerifierContracts: Set<Address>;
  uniqueResolverContracts: Set<Address>;
  predictionsHash: Hex;
} {
  const predictions = (auction?.predictions ?? []).map((p) => ({
    verifierContract: getAddress(p?.verifierContract as Address),
    resolverContract: getAddress(p?.resolverContract as Address),
    predictedOutcomes: (p?.predictedOutcomes || '0x') as Hex,
  }));

  // Canonical order: (verifier, resolver, predictedOutcomes)
  const sorted = [...predictions].sort((a, b) => {
    if (a.verifierContract !== b.verifierContract) return a.verifierContract < b.verifierContract ? -1 : 1;
    if (a.resolverContract !== b.resolverContract) return a.resolverContract < b.resolverContract ? -1 : 1;
    if (a.predictedOutcomes !== b.predictedOutcomes) return a.predictedOutcomes < b.predictedOutcomes ? -1 : 1;
    return 0;
  });

  const encoded = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'verifierContract', type: 'address' },
          { name: 'resolverContract', type: 'address' },
          { name: 'predictedOutcomes', type: 'bytes' },
        ],
      },
    ],
    [
      sorted.map((p) => ({
        verifierContract: p.verifierContract,
        resolverContract: p.resolverContract,
        predictedOutcomes: p.predictedOutcomes,
      })),
    ]
  );

  const predictionsHash = keccak256(encoded) as Hex;
  const uniqueVerifierContracts = new Set(sorted.map((p) => p.verifierContract));
  const uniqueResolverContracts = new Set(sorted.map((p) => p.resolverContract));
  return {
    predictions,
    uniqueVerifierContracts,
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
  const { uniqueVerifierContracts, uniqueResolverContracts, predictionsHash } = normalizeAuctionPayload(args.auction);
  if (uniqueVerifierContracts.size !== 1 || uniqueResolverContracts.size !== 1) {
    throw new Error('CROSS_VERIFIER_UNSUPPORTED');
  }
  const verifierContract = Array.from(uniqueVerifierContracts)[0];

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


