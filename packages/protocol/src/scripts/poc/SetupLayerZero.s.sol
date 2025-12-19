// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBaseNetwork} from "../../poc/SimpleOAppBaseNetwork.sol";

/**
 * @title SetupLayerZero
 * @notice Simple script to setup LayerZero on an existing pair
 * @dev Use this if ConfigureAndTest fails at LayerZero setup
 */
contract SetupLayerZero is Script {
    address private constant FACTORY_ADDRESS = 0x4aB1dECB7D8Dd00091e2A6285E99F319aABD5c5E;
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 chainId = block.chainid;
        
        console.log("Setting up LayerZero...");
        console.log("Factory:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("");
        
        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        address pairAddress = factory.getPairAddress(TEST_SALT);
        
        console.log("Pair address:", pairAddress);
        
        // Check if pair has code
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(pairAddress)
        }
        
        if (codeSize == 0) {
            console.log("ERROR: Pair has no code! Create the pair first.");
            return;
        }
        
        console.log("Pair code size:", codeSize);
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        if (chainId == 421614) {
            // Arbitrum Sepolia
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
            
            bool isSetup = pair.isSetupComplete();
            console.log("Current setup status:", isSetup);
            
            if (isSetup) {
                console.log("LayerZero already configured!");
            } else {
                console.log("Setting up LayerZero...");
                pair.setupLayerZero();
                console.log("SUCCESS: LayerZero setup complete!");
            }
            
            console.log("Final setup status:", pair.isSetupComplete());
            console.log("Received value:", pair.getValue());
            
        } else if (chainId == 84532) {
            // Base Sepolia
            SimpleOAppBaseNetwork pair = SimpleOAppBaseNetwork(payable(pairAddress));
            
            bool isSetup = pair.isSetupComplete();
            console.log("Current setup status:", isSetup);
            
            if (isSetup) {
                console.log("LayerZero already configured!");
            } else {
                console.log("Setting up LayerZero...");
                pair.setupLayerZero();
                console.log("SUCCESS: LayerZero setup complete!");
            }
            
            console.log("Final setup status:", pair.isSetupComplete());
            console.log("Received value:", pair.getValue());
            
        } else {
            console.log("ERROR: Unsupported network!");
        }
        
        vm.stopBroadcast();
    }
}

