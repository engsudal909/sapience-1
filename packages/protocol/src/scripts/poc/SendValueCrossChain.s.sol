// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBase} from "../../poc/SimpleOAppBase.sol";

/**
 * @title SendValueCrossChain
 * @notice Script to send a value from one network to another
 * @dev This script sends a value cross-chain and displays the transaction details.
 * Run this on the source network (Arbitrum or Base).
 */
contract SendValueCrossChain is Script {
    // Salt for the test pair (must match the salt used when creating the pair)
    bytes32 private constant TEST_SALT = keccak256("TEST_POC_PAIR_v1");

    function run() external {
        // Load configuration from environment
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // Value to send (can be overridden via environment)
        uint256 valueToSend = vm.envOr("VALUE_TO_SEND", uint256(12345));
        
        uint256 chainId = block.chainid;
        bool isArbitrum = chainId == 42161;
        bool isBase = chainId == 8453;
        
        require(isArbitrum || isBase, "This script only works on Arbitrum or Base");

        console.log("=== Send Value Cross-Chain ===");
        console.log("Chain ID:", chainId);
        console.log("Network:", isArbitrum ? "Arbitrum" : "Base");
        console.log("Factory address:", factoryAddress);
        console.log("Deployer:", deployer);
        console.log("Value to send:", valueToSend);
        console.log("");

        OAppFactory factory = OAppFactory(factoryAddress);
        
        // Verify pair exists
        require(factory.isPairDeployed(TEST_SALT), "Pair not deployed. Run TestOAppFactory first.");
        address pairAddress = factory.deployedPairs(TEST_SALT);
        console.log("Pair address:", pairAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Get the pair contract
        SimpleOAppArbitrum arbitrumPair;
        SimpleOAppBase basePair;
        
        if (isArbitrum) {
            arbitrumPair = SimpleOAppArbitrum(payable(pairAddress));
            
            // Verify setup is complete
            require(arbitrumPair.isSetupComplete(), "LayerZero setup not complete. Run TestOAppFactory first.");
            
            // Get quote
            console.log("Getting quote...");
            (uint256 nativeFee, uint256 lzTokenFee) = arbitrumPair.quoteSendValue(valueToSend);
            console.log("Native fee required:", nativeFee);
            console.log("LZ token fee:", lzTokenFee);
            console.log("Deployer balance:", deployer.balance);
            console.log("");
            
            require(deployer.balance >= nativeFee, "Insufficient balance for fees");
            
            // Send value
            console.log("Sending value to Base network...");
            arbitrumPair.sendValue{value: nativeFee}(valueToSend);
            console.log("Value sent successfully!");
            console.log("");
            console.log("Transaction details:");
            console.log("  - Value sent:", valueToSend);
            console.log("  - Destination: Base network");
            console.log("  - Fee paid:", nativeFee);
            
        } else {
            basePair = SimpleOAppBase(payable(pairAddress));
            
            // Verify setup is complete
            require(basePair.isSetupComplete(), "LayerZero setup not complete. Run TestOAppFactory first.");
            
            // Get quote
            console.log("Getting quote...");
            (uint256 nativeFee, uint256 lzTokenFee) = basePair.quoteSendValue(valueToSend);
            console.log("Native fee required:", nativeFee);
            console.log("LZ token fee:", lzTokenFee);
            console.log("Deployer balance:", deployer.balance);
            console.log("");
            
            require(deployer.balance >= nativeFee, "Insufficient balance for fees");
            
            // Send value
            console.log("Sending value to Arbitrum network...");
            basePair.sendValue{value: nativeFee}(valueToSend);
            console.log("Value sent successfully!");
            console.log("");
            console.log("Transaction details:");
            console.log("  - Value sent:", valueToSend);
            console.log("  - Destination: Arbitrum network");
            console.log("  - Fee paid:", nativeFee);
        }

        console.log("");
        console.log("Next steps:");
        console.log("1. Wait for LayerZero to deliver the message (check on LayerZero scan)");
        console.log("2. Run TestOAppFactory on the destination network to verify receipt");
        console.log("3. Or use CheckReceivedValue script to check the value");

        vm.stopBroadcast();
    }
}

