// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";

/**
 * @title DeployConditionalTokensResolver
 * @notice Deploy PredictionMarketLZConditionalTokensResolver on Ethereal
 * @dev This resolver receives resolution data from Polygon ConditionalTokensReader
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/02_Ethereal_deployResolver.s.sol \
 *        --rpc-url $ETHEREAL_RPC --broadcast --private-key $ETHEREAL_PRIVATE_KEY
 */
contract DeployConditionalTokensResolver is Script {
    function run() external {
        // Load from environment
        address endpoint = vm.envAddress("ETHEREAL_LZ_ENDPOINT");
        address owner = vm.envAddress("ETHEREAL_OWNER");
        uint256 maxPredictionMarkets = vm.envOr("PM_MAX_MARKETS", uint256(20));

        console.log("=== Deploying PredictionMarketLZConditionalTokensResolver on Ethereal ===");
        console.log("Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("Max Prediction Markets:", maxPredictionMarkets);

        vm.startBroadcast(vm.envUint("ETHEREAL_PRIVATE_KEY"));

        PredictionMarketLZConditionalTokensResolver resolver = new PredictionMarketLZConditionalTokensResolver(
            endpoint,
            owner,
            PredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: maxPredictionMarkets
            })
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("PredictionMarketLZConditionalTokensResolver deployed to:", address(resolver));
        console.log("");
        console.log("Next steps:");
        console.log("1. Set ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=", address(resolver));
        console.log("2. Run script 03_Polygon_configureReader.s.sol");
        console.log("3. Run script 04_Ethereal_configureResolver.s.sol");
    }
}

