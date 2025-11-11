import { elizaLogger } from "@elizaos/core";
import { createArbitrumPublicClient, createArbitrumWalletClient, getContractAddresses, getTradingConfig } from "./blockchain.js";

interface Bid {
  auctionId: string;
  maker: string;
  makerWager: string;
  makerDeadline: number;
  makerSignature: string;
  taker: string;
  takerCollateral?: string;
  wager?: string; // legacy fallback for takerCollateral
  resolver?: string;
  encodedPredictedOutcomes?: string;
  predictedOutcomes?: string[];
  makerNonce: number;
}

/**
 * Get the current maker nonce from the PredictionMarket contract
 */
export async function getCurrentMakerNonce(walletAddress: string, rpcUrl?: string): Promise<number> {
  try {
    const publicClient = await createArbitrumPublicClient(rpcUrl);
    const { PREDICTION_MARKET } = getContractAddresses();
    
    const nonce = await publicClient.readContract({
      address: PREDICTION_MARKET,
      abi: [{
        name: "nonces",
        type: "function",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view"
      }],
      functionName: 'nonces',
      args: [walletAddress as `0x${string}`],
    }) as bigint;

    return Number(nonce);
  } catch (error) {
    elizaLogger.error("[Contracts] Failed to get maker nonce:", error);
    return 0;
  }
}

/**
 * Ensure ERC-20 token approval for USDe before trading
 */
export async function ensureTokenApproval({
  privateKey,
  rpcUrl,
  amount,
}: {
  privateKey: `0x${string}`;
  rpcUrl?: string;
  amount: string;
}): Promise<void> {
  try {
    const { erc20Abi } = await import("viem");
    const { USDE_TOKEN, PREDICTION_MARKET } = getContractAddresses();
    const { approvalAmount } = getTradingConfig();

    const publicClient = await createArbitrumPublicClient(rpcUrl);
    const walletClient = await createArbitrumWalletClient(privateKey, rpcUrl);

    const allowance = await publicClient.readContract({
      address: USDE_TOKEN,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [walletClient.account.address, PREDICTION_MARKET],
    }) as bigint;

    const requiredAmount = BigInt(amount);
    elizaLogger.info(`[Contracts] Current allowance: ${allowance}, required: ${requiredAmount}`);

    if (allowance >= requiredAmount) {
      elizaLogger.info("[Contracts] Sufficient allowance already exists");
      return;
    }

    elizaLogger.info("[Contracts] Approving USDe tokens for PredictionMarket contract...");

    const hash = await walletClient.writeContract({
      address: USDE_TOKEN,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PREDICTION_MARKET, BigInt(approvalAmount)],
    });

    elizaLogger.info(`[Contracts] Approval transaction submitted: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    elizaLogger.info("[Contracts] Approval confirmed");
  } catch (error) {
    elizaLogger.error("[Contracts] Failed to ensure token approval:", error);
    throw error;
  }
}

/**
 * Build mint transaction calldata for PredictionMarket contract
 */
export async function buildMintCalldata({
  bid,
  maker,
  takerPrivateKey,
  encodedPredictedOutcomes,
  resolver,
  chainId,
  marketContract,
}: {
  bid: Bid;
  maker: string;
  takerPrivateKey: `0x${string}`;
  encodedPredictedOutcomes: `0x${string}`;
  resolver: `0x${string}`;
  chainId: number;
  marketContract: `0x${string}`;
}): Promise<`0x${string}`> {
  const {
    encodeFunctionData,
    encodeAbiParameters,
    keccak256,
    getAddress,
  } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");

  // Resolve amounts and parties
  const makerCollateral = BigInt(bid.makerWager || bid.wager || '0');
  const takerCollateral = BigInt(bid.takerCollateral || bid.wager || '0');
  const makerAddress = getAddress((bid.maker || maker) as `0x${string}`);
  const takerAccount = privateKeyToAccount(takerPrivateKey);
  const takerAddress = getAddress(takerAccount.address);

  // Use maker-provided deadline/nonce as part of taker approval preimage (contract enforces these)
  const takerDeadline = BigInt(bid.makerDeadline || 0);
  const makerNonce = BigInt(bid.makerNonce || 0);

  // Inner message per PredictionMarket.sol
  const messageHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes" },      // encodedPredictedOutcomes
        { type: "uint256" },    // takerCollateral
        { type: "uint256" },    // makerCollateral
        { type: "address" },    // resolver
        { type: "address" },    // maker
        { type: "uint256" },    // takerDeadline
        { type: "uint256" },    // makerNonce
      ],
      [
        encodedPredictedOutcomes,
        takerCollateral,
        makerCollateral,
        getAddress(resolver),
        makerAddress,
        takerDeadline,
        makerNonce,
      ]
    )
  );

  // EIP-712 Approve typed data per SignatureProcessor
  const domain = {
    name: "SignatureProcessor",
    version: "1",
    chainId,
    verifyingContract: getAddress(marketContract),
  } as const;
  const types = {
    Approve: [
      { name: "messageHash", type: "bytes32" },
      { name: "owner", type: "address" },
    ] as const,
  } as const;
  const typedMessage = {
    messageHash,
    owner: takerAddress,
  } as const;
  const takerSignature = await takerAccount.signTypedData({
    domain,
    types,
    primaryType: "Approve",
    message: typedMessage,
  });

  const mintRequest = {
    encodedPredictedOutcomes,
    resolver,
    makerCollateral,
    takerCollateral,
    maker: makerAddress,
    taker: takerAddress,
    makerNonce,
    takerSignature,
    takerDeadline,
    refCode: "0x0000000000000000000000000000000000000000000000000000000000000000",
  };

  return encodeFunctionData({
    abi: [{
      name: "mint",
      type: "function",
      inputs: [
        { name: "mintPredictionRequestData", type: "tuple", components: [
          { name: "encodedPredictedOutcomes", type: "bytes" },
          { name: "resolver", type: "address" },
          { name: "makerCollateral", type: "uint256" },
          { name: "takerCollateral", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "taker", type: "address" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerSignature", type: "bytes" },
          { name: "takerDeadline", type: "uint256" },
          { name: "refCode", type: "bytes32" },
        ]},
      ],
      outputs: [
        { name: "makerNftTokenId", type: "uint256" },
        { name: "takerNftTokenId", type: "uint256" }
      ],
    }],
    functionName: "mint",
    args: [mintRequest],
  });
}