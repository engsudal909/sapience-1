// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBase} from "../../poc/SimpleOAppBase.sol";

/**
 * @title TestOAppFactory
 * @notice Script to test the OAppFactory PoC end-to-end
 * @dev This script demonstrates:
 * 1. Creating a pair on the current network
 * 2. Setting up LayerZero configuration
 * 3. Sending a value cross-chain
 * 4. Verifying the value was received
 * 
 * Run this script on both networks (Arbitrum and Base) to test cross-chain communication.
 */
contract TestOAppFactory is Script {
    // Salt for the test pair (use the same salt on both networks)
    bytes32 private constant TEST_SALT = keccak256("TEST_POC_PAIR_v1");

    function run() external {
        // Load configuration from environment
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        uint256 chainId = block.chainid;
        bool isArbitrum = chainId == 42161;
        bool isBase = chainId == 8453;
        
        require(isArbitrum || isBase, "This script only works on Arbitrum or Base");

        console.log("=== OAppFactory PoC Test ===");
        console.log("Chain ID:", chainId);
        console.log("Network:", isArbitrum ? "Arbitrum" : "Base");
        console.log("Factory address:", factoryAddress);
        console.log("Deployer:", deployer);
        console.log("");

        OAppFactory factory = OAppFactory(factoryAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Check if pair already exists
        console.log("Step 1: Checking if pair exists...");
        bool pairExists = factory.isPairDeployed(TEST_SALT);
        
        address pairAddress;
        if (pairExists) {
            pairAddress = factory.deployedPairs(TEST_SALT);
            console.log("Pair already exists at:", pairAddress);
        } else {
            console.log("Pair does not exist, creating...");
            pairAddress = factory.createPair(TEST_SALT);
            console.log("Pair created at:", pairAddress);
        }
        console.log("");

        // Step 2: Get the pair contract
        SimpleOAppArbitrum arbitrumPair;
        SimpleOAppBase basePair;
        
        if (isArbitrum) {
            arbitrumPair = SimpleOAppArbitrum(payable(pairAddress));
        } else {
            basePair = SimpleOAppBase(payable(pairAddress));
        }

        // Step 3: Check if LayerZero setup is complete
        console.log("Step 2: Checking LayerZero setup...");
        bool setupComplete;
        if (isArbitrum) {
            setupComplete = arbitrumPair.isSetupComplete();
        } else {
            setupComplete = basePair.isSetupComplete();
        }

        if (!setupComplete) {
            console.log("LayerZero setup not complete, setting up...");
            if (isArbitrum) {
                arbitrumPair.setupLayerZero();
            } else {
                basePair.setupLayerZero();
            }
            console.log("LayerZero setup completed");
        } else {
            console.log("LayerZero setup already complete");
        }
        console.log("");

        // Step 4: Get current value
        console.log("Step 3: Checking current value...");
        uint256 currentValue;
        if (isArbitrum) {
            currentValue = arbitrumPair.getValue();
        } else {
            currentValue = basePair.getValue();
        }
        console.log("Current value:", currentValue);
        console.log("");

        // Step 5: Get quote for sending a value
        console.log("Step 4: Getting quote for sending value...");
        uint256 testValue = 12345;
        uint256 nativeFee;
        uint256 lzTokenFee;
        
        if (isArbitrum) {
            (nativeFee, lzTokenFee) = arbitrumPair.quoteSendValue(testValue);
        } else {
            (nativeFee, lzTokenFee) = basePair.quoteSendValue(testValue);
        }
        
        console.log("Test value to send:", testValue);
        console.log("Native fee required:", nativeFee);
        console.log("LZ token fee:", lzTokenFee);
        console.log("");

        // Step 6: Send value (optional - uncomment to actually send)
        // Note: This will cost gas and LayerZero fees
        /*
        console.log("Step 5: Sending value cross-chain...");
        uint256 balance = deployer.balance;
        console.log("Deployer balance:", balance);
        
        if (balance < nativeFee) {
            console.log("WARNING: Insufficient balance to send value");
            console.log("Required:", nativeFee);
            console.log("Available:", balance);
        } else {
            if (isArbitrum) {
                arbitrumPair.sendValue{value: nativeFee}(testValue);
            } else {
                basePair.sendValue{value: nativeFee}(testValue);
            }
            console.log("Value sent! Transaction hash:", vm.envString("TX_HASH"));
            console.log("Wait for LayerZero to deliver the message (usually a few minutes)");
            console.log("Then run this script again on the other network to verify receipt");
        }
        console.log("");
        */

        // Step 7: Display summary
        console.log("=== Test Summary ===");
        console.log("Pair address:", pairAddress);
        console.log("Pair exists:", pairExists);
        console.log("Setup complete:", setupComplete);
        console.log("Current value:", currentValue);
        console.log("");
        console.log("Next steps:");
        console.log("1. Run this script on the other network with the same FACTORY_ADDRESS");
        console.log("2. Uncomment Step 5 in this script to send a value");
        console.log("3. Wait for LayerZero delivery (check on LayerZero scan)");
        console.log("4. Run this script again on the receiving network to verify value was received");

        vm.stopBroadcast();
    }

    /**
     * @notice Helper function to check pair status without broadcasting
     */
    function checkPairStatus() external view {
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");
        OAppFactory factory = OAppFactory(factoryAddress);
        
        bool pairExists = factory.isPairDeployed(TEST_SALT);
        address pairAddress = factory.deployedPairs(TEST_SALT);
        
        console.log("Pair exists:", pairExists);
        console.log("Pair address:", pairAddress);
        
        if (pairExists) {
            uint256 chainId = block.chainid;
            bool isArbitrum = chainId == 42161;
            
            if (isArbitrum) {
                SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
                console.log("Setup complete:", pair.isSetupComplete());
                console.log("Current value:", pair.getValue());
            } else {
                SimpleOAppBase pair = SimpleOAppBase(payable(pairAddress));
                console.log("Setup complete:", pair.isSetupComplete());
                console.log("Current value:", pair.getValue());
            }
        }
    }
}

