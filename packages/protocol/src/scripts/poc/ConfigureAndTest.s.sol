// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBase} from "../../poc/SimpleOAppBase.sol";

/**
 * @title ConfigureAndTest
 * @notice Script to configure DVN settings, create pairs, and test cross-chain communication
 * @dev This script helps you:
 * 1. Configure DVN settings (optional - you need to get addresses from LayerZero docs)
 * 2. Create a pair on both networks
 * 3. Setup LayerZero on both pairs
 * 4. Test cross-chain value transfer
 */
contract ConfigureAndTest is Script {
    // Factory address (same on both networks)
    address private constant FACTORY_ADDRESS = 0x4aB1dECB7D8Dd00091e2A6285E99F319aABD5c5E;
    
    // Test salt for pair creation
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        console.log("========================================");
        console.log("OAppFactory Configuration & Testing");
        console.log("========================================");
        console.log("Factory address:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("Network:", _getNetworkName(chainId));
        console.log("");

        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        
        // Step 1: Check if DVN is configured
        console.log("Step 1: Checking DVN Configuration");
        console.log("----------------------------------------");
        bool isArbitrumDVNSet = factory.isDVNConfigSet(OAppFactory.NetworkType.ARBITRUM);
        bool isBaseDVNSet = factory.isDVNConfigSet(OAppFactory.NetworkType.BASE);
        
        console.log("Arbitrum DVN configured:", isArbitrumDVNSet);
        console.log("Base DVN configured:", isBaseDVNSet);
        console.log("");
        
        if (!isArbitrumDVNSet || !isBaseDVNSet) {
            console.log("NOTE: DVN not configured yet.");
            console.log("You can configure it using:");
            console.log("  factory.setDefaultDVNConfigWithDefaults(...)");
            console.log("");
            console.log("You'll need to get these addresses from LayerZero documentation:");
            console.log("  - sendLib: Send library address");
            console.log("  - receiveLib: Receive library address");
            console.log("  - requiredDVN: DVN address");
            console.log("  - executor: Executor address");
            console.log("");
        }
        
        // Step 2: Check if pair already exists
        console.log("Step 2: Checking Pair Status");
        console.log("----------------------------------------");
        bool pairExists = factory.isPairDeployed(TEST_SALT);
        address pairAddress = factory.getPairAddress(TEST_SALT);
        
        console.log("Pair exists:", pairExists);
        console.log("Pair address:", pairAddress);
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Step 3: Create pair if it doesn't exist
        if (!pairExists) {
            console.log("Step 3: Creating Pair");
            console.log("----------------------------------------");
            console.log("Creating pair with salt:", vm.toString(TEST_SALT));
            
            address deployedPair = factory.createPair(TEST_SALT);
            console.log("Pair created at:", deployedPair);
            console.log("");
            
            // Verify it matches expected address
            if (deployedPair == pairAddress) {
                console.log("SUCCESS: Pair address matches expected!");
            } else {
                console.log("WARNING: Pair address does not match expected");
                console.log("Expected:", pairAddress);
                console.log("Actual:", deployedPair);
            }
            console.log("");
        } else {
            console.log("Step 3: Pair Already Exists");
            console.log("----------------------------------------");
            console.log("Pair already deployed at:", pairAddress);
            console.log("");
        }
        
        // Step 4: Setup LayerZero on the pair
        console.log("Step 4: Setting Up LayerZero");
        console.log("----------------------------------------");
        
        // Determine which contract type based on network
        if (chainId == 421614) {
            // Arbitrum Sepolia
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
            bool isSetup = pair.isSetupComplete();
            
            if (!isSetup) {
                console.log("Setting up LayerZero on Arbitrum Sepolia...");
                pair.setupLayerZero();
                console.log("LayerZero setup complete!");
            } else {
                console.log("LayerZero already configured");
            }
            
            // Show current state
            console.log("Setup complete:", pair.isSetupComplete());
            console.log("Current received value:", pair.getValue());
            console.log("");
        } else if (chainId == 84532) {
            // Base Sepolia
            SimpleOAppBase pair = SimpleOAppBase(payable(pairAddress));
            bool isSetup = pair.isSetupComplete();
            
            if (!isSetup) {
                console.log("Setting up LayerZero on Base Sepolia...");
                pair.setupLayerZero();
                console.log("LayerZero setup complete!");
            } else {
                console.log("LayerZero already configured");
            }
            
            // Show current state
            console.log("Setup complete:", pair.isSetupComplete());
            console.log("Current received value:", pair.getValue());
            console.log("");
        }
        
        vm.stopBroadcast();
        
        // Step 5: Instructions for testing
        console.log("========================================");
        console.log("Next Steps for Testing");
        console.log("========================================");
        console.log("1. Configure DVN settings (if not done):");
        console.log("   factory.setDefaultDVNConfigWithDefaults(...)");
        console.log("");
        console.log("2. Send value from one network to the other:");
        if (chainId == 421614) {
            console.log("   On Arbitrum Sepolia:");
            console.log("   SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(", vm.toString(pairAddress), "));");
            console.log("   uint256 fee = pair.quoteSendValue(12345);");
            console.log("   pair.sendValue{value: fee}(12345);");
        } else {
            console.log("   On Base Sepolia:");
            console.log("   SimpleOAppBase pair = SimpleOAppBase(payable(", vm.toString(pairAddress), "));");
            console.log("   uint256 fee = pair.quoteSendValue(12345);");
            console.log("   pair.sendValue{value: fee}(12345);");
        }
        console.log("");
        console.log("3. Check received value on the other network:");
        console.log("   uint256 received = pair.getValue();");
        console.log("");
        console.log("4. Wait a few minutes for LayerZero to deliver the message");
        console.log("");
    }
    
    function _getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 42161) return "Arbitrum One";
        if (chainId == 421614) return "Arbitrum Sepolia";
        if (chainId == 8453) return "Base";
        if (chainId == 84532) return "Base Sepolia";
        return "Unknown";
    }
}

