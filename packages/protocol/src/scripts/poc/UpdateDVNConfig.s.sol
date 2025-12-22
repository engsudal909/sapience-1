// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/**
 * @title UpdateDVNConfig
 * @notice Script to update DVN configuration for an existing pair
 * @dev This script directly calls the LayerZero endpoint to update the DVN configuration.
 *      Use this to fix mismatched configurations between networks.
 * 
 * IMPORTANT: Make sure both networks have the SAME configuration:
 * - Same requiredDVNCount
 * - Same confirmations
 * - Same DVN addresses
 */
contract UpdateDVNConfig is Script {
    address private constant FACTORY_ADDRESS = 0xAB5C685d69F4EA2ec36E6e356A192AdAa2338129;
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");
    
    // LayerZero endpoint (unified for mainnet)
    address private constant ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    
    // EIDs
    uint32 private constant ARBITRUM_EID = 30110;
    uint32 private constant BASE_EID = 30184;
    
    // Config type constants
    uint32 private constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 private constant ULN_CONFIG_TYPE = 2;
    
    // Configuration values - UPDATE THESE TO MATCH BOTH NETWORKS
    uint64 private constant CONFIRMATIONS = 20;  // Make sure this matches on both networks
    uint32 private constant MAX_MESSAGE_SIZE = 10000;
    uint8 private constant REQUIRED_DVN_COUNT = 1;  // Make sure this matches on both networks
    
    // Arbitrum One mainnet addresses
    address private constant ARB_MAINNET_SEND_LIB = 0x975bcD720be66659e3EB3C0e4F1866a3020E493A;
    address private constant ARB_MAINNET_RECEIVE_LIB = 0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf;
    address private constant ARB_MAINNET_DVN = 0x2f55C492897526677C5B68fb199ea31E2c126416;
    address private constant ARB_MAINNET_EXECUTOR = 0x31CAe3B7fB82d847621859fb1585353c5720660D;
    
    // Base mainnet addresses
    address private constant BASE_MAINNET_SEND_LIB = 0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2;
    address private constant BASE_MAINNET_RECEIVE_LIB = 0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6;
    address private constant BASE_MAINNET_DVN = 0x9e059a54699a285714207b43B055483E78FAac25;
    address private constant BASE_MAINNET_EXECUTOR = 0x2CCA08ae69E0C44b18a57Ab2A87644234dAebaE4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        console.log("========================================");
        console.log("Update DVN Configuration for Pair");
        console.log("========================================");
        console.log("Factory address:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("Network:", chainId == 42161 ? "Arbitrum One" : "Base");
        console.log("Salt:", vm.toString(TEST_SALT));
        console.log("");
        
        // Verify we're on mainnet
        if (chainId != 42161 && chainId != 8453) {
            console.log("ERROR: This script only works on Arbitrum One (42161) or Base (8453) mainnet!");
            revert("Unsupported network");
        }
        
        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        
        // Verify deployer is the factory owner
        address factoryOwner = factory.owner();
        if (deployer != factoryOwner) {
            console.log("ERROR: Deployer is not the factory owner!");
            console.log("Deployer address:", deployer);
            console.log("Factory owner:", factoryOwner);
            revert("Not factory owner");
        }
        console.log("Deployer verified as factory owner - OK");
        console.log("");
        
        // Verify pair exists
        if (!factory.isPairDeployed(TEST_SALT)) {
            console.log("ERROR: Pair not deployed! Create it first.");
            return;
        }
        
        address pairAddress = factory.getPairAddress(TEST_SALT);
        console.log("Pair address:", pairAddress);
        console.log("");
        
        // Determine network-specific values
        address sendLib;
        address receiveLib;
        address requiredDVN;
        address executor;
        uint32 remoteEid;
        uint32 localEid;
        
        if (chainId == 42161) {
            // Arbitrum One
            sendLib = ARB_MAINNET_SEND_LIB;
            receiveLib = ARB_MAINNET_RECEIVE_LIB;
            requiredDVN = ARB_MAINNET_DVN;
            executor = ARB_MAINNET_EXECUTOR;
            remoteEid = BASE_EID;  // Sending to Base
            localEid = ARBITRUM_EID;  // Receiving on Arbitrum
        } else {
            // Base
            sendLib = BASE_MAINNET_SEND_LIB;
            receiveLib = BASE_MAINNET_RECEIVE_LIB;
            requiredDVN = BASE_MAINNET_DVN;
            executor = BASE_MAINNET_EXECUTOR;
            remoteEid = ARBITRUM_EID;  // Sending to Arbitrum
            localEid = BASE_EID;  // Receiving on Base
        }
        
        console.log("Configuration values:");
        console.log("  Confirmations:", CONFIRMATIONS);
        console.log("  Required DVN Count:", REQUIRED_DVN_COUNT);
        console.log("  Max Message Size:", MAX_MESSAGE_SIZE);
        console.log("  Send Lib:", sendLib);
        console.log("  Receive Lib:", receiveLib);
        console.log("  Required DVN:", requiredDVN);
        console.log("  Executor:", executor);
        console.log("  Remote EID:", remoteEid);
        console.log("  Local EID:", localEid);
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Updating DVN configuration for pair...");
        console.log("(Using factory's updateDVNConfigForPair which has proper permissions)");
        console.log("");
        
        // Use the factory's function to update with custom values
        // This function calls the endpoint from the factory (which is the delegate)
        factory.updateDVNConfigForPair(
            TEST_SALT,
            CONFIRMATIONS,
            REQUIRED_DVN_COUNT
        );
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("========================================");
        console.log("SUCCESS: DVN configuration updated!");
        console.log("========================================");
        console.log("");
        console.log("IMPORTANT: Run this script on BOTH networks with the SAME values:");
        console.log("  - CONFIRMATIONS:", CONFIRMATIONS);
        console.log("  - REQUIRED_DVN_COUNT:", REQUIRED_DVN_COUNT);
        console.log("");
        console.log("After updating both networks, the messages should be delivered.");
        console.log("");
    }
}

