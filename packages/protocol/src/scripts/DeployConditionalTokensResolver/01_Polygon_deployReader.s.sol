// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {ConditionalTokensReader} from "../../predictionMarket/resolvers/ConditionalTokensReader.sol";

/**
 * @title DeployConditionalTokensReader
 * @notice Deploy ConditionalTokensReader on Polygon
 * @dev This contract reads ConditionalTokens and sends resolution data to Ethereal resolver
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/01_Polygon_deployReader.s.sol \
 *        --rpc-url $POLYGON_RPC --broadcast --private-key $POLYGON_PRIVATE_KEY
 */
contract DeployConditionalTokensReader is Script {
    function run() external {
        // Load from environment
        address endpoint = vm.envAddress("POLYGON_LZ_ENDPOINT");
        address owner = vm.envAddress("POLYGON_OWNER");
        address conditionalTokens = vm.envAddress("POLYGON_CONDITIONAL_TOKENS");
        
        // Default ConditionalTokens address on Polygon if not set
        if (conditionalTokens == address(0)) {
            conditionalTokens = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045; // Polygon ConditionalTokens
        }

        console.log("=== Deploying ConditionalTokensReader on Polygon ===");
        console.log("Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("ConditionalTokens:", conditionalTokens);

        vm.startBroadcast(vm.envUint("POLYGON_PRIVATE_KEY"));

        ConditionalTokensReader reader = new ConditionalTokensReader(
            endpoint,
            owner,
            ConditionalTokensReader.Settings({
                conditionalTokens: conditionalTokens
            })
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("ConditionalTokensReader deployed to:", address(reader));
        console.log("");
        console.log("Next steps:");
        console.log("1. Set POLYGON_CONDITIONAL_TOKENS_READER=", address(reader));
        console.log("2. Run script 02_Ethereal_deployResolver.s.sol");
        console.log("3. Run script 03_Polygon_configureReader.s.sol");
    }
}

