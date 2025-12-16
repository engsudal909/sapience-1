// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";

/**
 * @title VerifyLzReadConditionalTokensResolver
 * @notice Verification helper script - outputs constructor arguments for forge verify-contract
 * @dev Run with:
 *      forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_verifyContract.s.sol \
 *        --rpc-url $ARB_RPC
 *      
 *      Then use the output to verify:
 *      forge verify-contract 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6 \
 *        src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol:PredictionMarketLZConditionalTokensResolver \
 *        --chain-id 42161 \
 *        --etherscan-api-key $ETHERSCAN_API_KEY \
 *        --constructor-args $(cast abi-encode "constructor(address,address,(uint256,uint32,uint32,address,uint16,uint128,uint32))" \
 *          0x1a44076050125825900e736c501f859c50fE728c \
 *          0xdb5Af497A73620d881561eDb508012A5f84e9BA2 \
 *          "(10,30110,30109,0x4D97DCd97eC945f40cF65F87097ACe5EA0476045,15,200000,32)")
 */
contract VerifyLzReadConditionalTokensResolver is Script {
    function run() external view {
        address resolver = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
        
        console.log("=== Verification Helper ===");
        console.log("Contract Address:", resolver);
        console.log("");
        console.log("Constructor Arguments:");
        console.log("  endpoint: 0x1a44076050125825900e736c501f859c50fE728c");
        console.log("  owner: 0xdb5Af497A73620d881561eDb508012A5f84e9BA2");
        console.log("  config:");
        console.log("    maxPredictionMarkets: 10");
        console.log("    readChannelEid: 30110");
        console.log("    targetEid: 30109");
        console.log("    conditionalTokens: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045");
        console.log("    confirmations: 15");
        console.log("    lzReadGasLimit: 200000");
        console.log("    lzReadResultSize: 32");
        console.log("");
        console.log("=== Verification Command ===");
        console.log("Run this command to verify:");
        console.log("");
        console.log("forge verify-contract \\");
        console.log("  0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6 \\");
        console.log("  src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol:PredictionMarketLZConditionalTokensResolver \\");
        console.log("  --chain-id 42161 \\");
        console.log("  --etherscan-api-key $ETHERSCAN_API_KEY \\");
        console.log("  --constructor-args $(cast abi-encode \"constructor(address,address,(uint256,uint32,uint32,address,uint16,uint128,uint32))\" \\");
        console.log("    0x1a44076050125825900e736c501f859c50fE728c \\");
        console.log("    0xdb5Af497A73620d881561eDb508012A5f84e9BA2 \\");
        console.log("    \"(10,30110,30109,0x4D97DCd97eC945f40cF65F87097ACe5EA0476045,15,200000,32)\")");
    }
}

