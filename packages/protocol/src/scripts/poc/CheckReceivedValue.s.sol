// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBase} from "../../poc/SimpleOAppBase.sol";

/**
 * @title CheckReceivedValue
 * @notice Script to check if a value was received from the other network
 * @dev This is a view-only script that doesn't require broadcasting.
 * Run this on the destination network to verify cross-chain message delivery.
 */
contract CheckReceivedValue is Script {
    // Salt for the test pair (must match the salt used when creating the pair)
    bytes32 private constant TEST_SALT = keccak256("TEST_POC_PAIR_v1");

    function run() external view {
        // Load configuration from environment
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");
        
        uint256 chainId = block.chainid;
        bool isArbitrum = chainId == 42161;
        bool isBase = chainId == 8453;
        
        require(isArbitrum || isBase, "This script only works on Arbitrum or Base");

        console.log("=== Check Received Value ===");
        console.log("Chain ID:", chainId);
        console.log("Network:", isArbitrum ? "Arbitrum" : "Base");
        console.log("Factory address:", factoryAddress);
        console.log("");

        OAppFactory factory = OAppFactory(factoryAddress);
        
        // Check if pair exists
        if (!factory.isPairDeployed(TEST_SALT)) {
            console.log("ERROR: Pair not deployed");
            console.log("Run TestOAppFactory first to create the pair");
            return;
        }
        
        address pairAddress = factory.deployedPairs(TEST_SALT);
        console.log("Pair address:", pairAddress);
        console.log("");

        // Get pair contract
        if (isArbitrum) {
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
            
            console.log("Pair Status:");
            console.log("  - Setup complete:", pair.isSetupComplete());
            console.log("  - Factory:", pair.factory());
            console.log("  - Owner:", pair.owner());
            console.log("");
            
            if (pair.isSetupComplete()) {
                uint256 receivedValue = pair.getValue();
                console.log("Received Value:", receivedValue);
                console.log("");
                
                if (receivedValue == 0) {
                    console.log("No value received yet.");
                    console.log("This could mean:");
                    console.log("  1. No value has been sent from Base network");
                    console.log("  2. LayerZero message is still in transit");
                    console.log("  3. Message delivery failed (check LayerZero scan)");
                } else {
                    console.log("SUCCESS: Value received from Base network!");
                    console.log("The cross-chain bridge is working correctly.");
                }
            } else {
                console.log("WARNING: LayerZero setup not complete");
                console.log("Run TestOAppFactory to complete setup");
            }
        } else {
            SimpleOAppBase pair = SimpleOAppBase(payable(pairAddress));
            
            console.log("Pair Status:");
            console.log("  - Setup complete:", pair.isSetupComplete());
            console.log("  - Factory:", pair.factory());
            console.log("  - Owner:", pair.owner());
            console.log("");
            
            if (pair.isSetupComplete()) {
                uint256 receivedValue = pair.getValue();
                console.log("Received Value:", receivedValue);
                console.log("");
                
                if (receivedValue == 0) {
                    console.log("No value received yet.");
                    console.log("This could mean:");
                    console.log("  1. No value has been sent from Arbitrum network");
                    console.log("  2. LayerZero message is still in transit");
                    console.log("  3. Message delivery failed (check LayerZero scan)");
                } else {
                    console.log("SUCCESS: Value received from Arbitrum network!");
                    console.log("The cross-chain bridge is working correctly.");
                }
            } else {
                console.log("WARNING: LayerZero setup not complete");
                console.log("Run TestOAppFactory to complete setup");
            }
        }
    }
}

