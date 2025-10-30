// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolver} from "../../predictionMarket/resolvers/PredictionMarketLZResolver.sol";

// Prediction Market is on Ethereal chain
// Deploy this resolver on Ethereal (receives LZ messages from UMA side)
contract DeployPredictionMarketLZResolver is Script {
    function run() external {
        // Load from environment (.env/.env.local)
        address endpoint = vm.envAddress("ETHEREAL_LZ_ENDPOINT");
        address owner = vm.envAddress("OWNER");
        uint256 maxPredictionMarkets = vm.envOr("PM_MAX_MARKETS", uint256(20));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        PredictionMarketLZResolver resolver = new PredictionMarketLZResolver(
            endpoint,
            owner,
            PredictionMarketLZResolver.Settings({
                maxPredictionMarkets: maxPredictionMarkets
            })
        );
        vm.stopBroadcast();

        console.log("PredictionMarketLZResolver deployed to:", address(resolver));
    }
}


