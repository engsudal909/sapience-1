// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title RequestResolutionScript
 * @notice Enable read channel and send requestResolution() for known conditionIds
 * @dev Run with:
 *      forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_requestResolution.s.sol \
 *        --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY
 */
contract RequestResolutionScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    // Condition IDs from fork test (real Polymarket conditions)
    // Condition that resolved to YES: payoutNumerators = [0, 1]
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;
    // Condition that resolved to NO: payoutNumerators = [1, 0]
    bytes32 constant CONDITION_NO = 0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address resolverAddr = RESOLVER;
        bytes32 conditionYes = CONDITION_YES;
        bytes32 conditionNo = CONDITION_NO;
        uint32 readChannelEid = READ_CHANNEL_EID;

        PredictionMarketLZConditionalTokensResolver resolver = 
            PredictionMarketLZConditionalTokensResolver(payable(resolverAddr));

        console.log("=== Requesting Resolution via lzRead ===");
        console.log("Resolver:", resolverAddr);
        console.log("Read Channel EID:", readChannelEid);
        console.log("Condition YES:", vm.toString(conditionYes));
        console.log("Condition NO:", vm.toString(conditionNo));

        // Quote fees for both conditions
        MessagingFee memory feeYes = resolver.quoteResolution(conditionYes);
        MessagingFee memory feeNo = resolver.quoteResolution(conditionNo);
        
        uint256 totalFee = feeYes.nativeFee + feeNo.nativeFee;
        
        console.log("");
        console.log("Fee for YES condition:", feeYes.nativeFee);
        console.log("Fee for NO condition:", feeNo.nativeFee);
        console.log("Total native fee required:", totalFee);

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        // Request resolution for YES condition
        console.log("");
        console.log("Requesting resolution for YES condition...");
        resolver.requestResolution{value: feeYes.nativeFee}(
            conditionYes,
            bytes32("SMOKE_TEST_YES")
        );
        console.log("Request sent for YES condition");

        // Request resolution for NO condition  
        console.log("");
        console.log("Requesting resolution for NO condition...");
        resolver.requestResolution{value: feeNo.nativeFee}(
            conditionNo,
            bytes32("SMOKE_TEST_NO")
        );
        console.log("Request sent for NO condition");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Requests Complete ===");
        console.log("Both lzRead requests have been sent.");
        console.log("Wait for LayerZero callbacks to settle the conditions.");
        console.log("");
        console.log("Next step: After ~30-60 seconds, run the verify script:");
        console.log("  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_verifyResolverState.s.sol \\");
        console.log("    --rpc-url $ARB_RPC");
    }
}

