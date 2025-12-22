// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBaseNetwork} from "../../poc/SimpleOAppBaseNetwork.sol";

/**
 * @title CheckReceivedValue
 * @notice Script to check the value received from the other network
 * @dev Use this script to verify cross-chain message delivery
 */
contract CheckReceivedValue is Script {
    // Factory address (same on both networks)
    address private constant FACTORY_ADDRESS = 0xAB5C685d69F4EA2ec36E6e356A192AdAa2338129;
    
    // Test salt (must match the one used to create the pair)
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external view {
        uint256 chainId = block.chainid;
        
        // Get pair address from factory
        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        address pairAddress = factory.getPairAddress(TEST_SALT);
        
        console.log("========================================");
        console.log("Check Received Value");
        console.log("========================================");
        console.log("Pair address:", pairAddress);
        console.log("Chain ID:", chainId);
        console.log("Network:", _getNetworkName(chainId));
        console.log("");
        
        if (chainId == 42161) {
            // Arbitrum One
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
            
            console.log("LayerZero setup complete:", pair.isSetupComplete());
            console.log("Received value from Base:", pair.getValue());
            console.log("");
            
            if (pair.getValue() == 0) {
                console.log("No value received yet.");
                console.log("This could mean:");
                console.log("  1. No value has been sent from Base");
                console.log("  2. LayerZero message is still in transit (wait a few minutes)");
                console.log("  3. Message delivery failed (check LayerZero explorer)");
            } else {
                console.log("SUCCESS: Value received from Base!");
            }
            
        } else if (chainId == 8453) {
            // Base
            SimpleOAppBaseNetwork pair = SimpleOAppBaseNetwork(payable(pairAddress));
            
            console.log("LayerZero setup complete:", pair.isSetupComplete());
            console.log("Received value from Arbitrum One:", pair.getValue());
            console.log("");
            
            if (pair.getValue() == 0) {
                console.log("No value received yet.");
                console.log("This could mean:");
                console.log("  1. No value has been sent from Arbitrum One");
                console.log("  2. LayerZero message is still in transit (wait a few minutes)");
                console.log("  3. Message delivery failed (check LayerZero explorer)");
            } else {
                console.log("SUCCESS: Value received from Arbitrum One!");
            }
        } else {
            console.log("ERROR: Unsupported network!");
            console.log("This script only works on Arbitrum One (42161) or Base (8453)");
        }
    }
    
    
    function _getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 42161) return "Arbitrum One";
        if (chainId == 8453) return "Base";
        return "Unknown";
    }
}
