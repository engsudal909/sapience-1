// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBaseNetwork} from "../../poc/SimpleOAppBaseNetwork.sol";

/**
 * @title SendValueTest
 * @notice Script to send a value cross-chain and check the result
 * @dev Use this script to test cross-chain communication
 */
contract SendValueTest is Script {
    // Factory address (same on both networks)
    address private constant FACTORY_ADDRESS = 0x4aB1dECB7D8Dd00091e2A6285E99F319aABD5c5E;
    
    // Test salt (must match the one used to create the pair)
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        // Get pair address from factory
        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        address pairAddress = factory.getPairAddress(TEST_SALT);
        
        console.log("========================================");
        console.log("Cross-Chain Value Transfer Test");
        console.log("========================================");
        console.log("Pair address:", pairAddress);
        console.log("Chain ID:", chainId);
        console.log("Network:", _getNetworkName(chainId));
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        uint256 valueToSend = 12345;
        
        if (chainId == 421614) {
            // Arbitrum Sepolia - Send to Base Sepolia
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
            
            // Check setup
            if (!pair.isSetupComplete()) {
                console.log("ERROR: LayerZero not set up yet!");
                console.log("Run ConfigureAndTest.s.sol first");
                vm.stopBroadcast();
                return;
            }
            
            // Get quote
            (uint256 nativeFee, uint256 lzTokenFee) = pair.quoteSendValue(valueToSend);
            console.log("Sending value:", valueToSend);
            console.log("Native fee required:", nativeFee);
            console.log("LZ token fee:", lzTokenFee);
            console.log("");
            
            // Send value
            console.log("Sending value to Base Sepolia...");
            pair.sendValue{value: nativeFee}(valueToSend);
            console.log("Value sent! Transaction submitted.");
            console.log("");
            console.log("Wait a few minutes, then check on Base Sepolia using CheckReceivedValue.s.sol");
            
        } else if (chainId == 84532) {
            // Base Sepolia - Send to Arbitrum Sepolia
            SimpleOAppBaseNetwork pair = SimpleOAppBaseNetwork(payable(pairAddress));
            
            // Check setup
            if (!pair.isSetupComplete()) {
                console.log("ERROR: LayerZero not set up yet!");
                console.log("Run ConfigureAndTest.s.sol first");
                vm.stopBroadcast();
                return;
            }
            
            // Get quote
            (uint256 nativeFee, uint256 lzTokenFee) = pair.quoteSendValue(valueToSend);
            console.log("Sending value:", valueToSend);
            console.log("Native fee required:", nativeFee);
            console.log("LZ token fee:", lzTokenFee);
            console.log("");
            
            // Send value
            console.log("Sending value to Arbitrum Sepolia...");
            pair.sendValue{value: nativeFee}(valueToSend);
            console.log("Value sent! Transaction submitted.");
            console.log("");
            console.log("Wait a few minutes, then check on Arbitrum Sepolia using CheckReceivedValue.s.sol");
        } else {
            console.log("ERROR: Unsupported network!");
            console.log("This script only works on Arbitrum Sepolia (421614) or Base Sepolia (84532)");
        }
        
        vm.stopBroadcast();
    }
    
    
    function _getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 421614) return "Arbitrum Sepolia";
        if (chainId == 84532) return "Base Sepolia";
        return "Unknown";
    }
}

