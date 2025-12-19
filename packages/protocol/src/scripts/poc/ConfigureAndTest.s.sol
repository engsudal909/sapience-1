// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBaseNetwork} from "../../poc/SimpleOAppBaseNetwork.sol";

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
    address private constant FACTORY_ADDRESS = 0xD3ccEF4741d1C7886321bf732E010455F9c60a1B;
    
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
            console.log("Expected pair address:", pairAddress);
            console.log("");
            
            try factory.createPair(TEST_SALT) returns (address deployedPair) {
                console.log("Pair created at:", deployedPair);
                console.log("");
                
                // Verify it matches expected address
                if (deployedPair == pairAddress) {
                    console.log("SUCCESS: Pair address matches expected!");
                } else {
                    console.log("WARNING: Pair address does not match expected");
                    console.log("Expected:", pairAddress);
                    console.log("Actual:", deployedPair);
                    // Use the actual deployed address
                    pairAddress = deployedPair;
                }
                console.log("");
            } catch Error(string memory reason) {
                console.log("ERROR creating pair:", reason);
                console.log("");
                console.log("Possible causes:");
                console.log("  1. DVN configuration may be incorrect");
                console.log("  2. Insufficient gas");
                console.log("  3. Factory may not have proper permissions");
                vm.stopBroadcast();
                return;
            } catch (bytes memory lowLevelData) {
                console.log("ERROR: Low-level error creating pair");
                console.log("Error data length:", lowLevelData.length);
                vm.stopBroadcast();
                return;
            }
        } else {
            console.log("Step 3: Pair Already Exists");
            console.log("----------------------------------------");
            console.log("Pair already deployed at:", pairAddress);
            console.log("");
        }
        
        // Step 4: Setup LayerZero on the pair
        console.log("Step 4: Setting Up LayerZero");
        console.log("----------------------------------------");
        
        // Verify pair has code
        uint256 pairCodeSize;
        assembly {
            pairCodeSize := extcodesize(pairAddress)
        }
        
        if (pairCodeSize == 0) {
            console.log("ERROR: Pair address has no code!");
            console.log("The pair may not have been deployed correctly.");
            console.log("Pair address:", pairAddress);
            vm.stopBroadcast();
            return;
        }
        
        console.log("Pair code size:", pairCodeSize);
        console.log("");
        
        // Determine which contract type based on network
        if (chainId == 421614) {
            // Arbitrum Sepolia
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
            
            // Verify it's the correct contract type
            try pair.factory() returns (address factoryAddr) {
                console.log("Pair factory address:", factoryAddr);
                if (factoryAddr != FACTORY_ADDRESS) {
                    console.log("WARNING: Pair factory address doesn't match!");
                }
            } catch {
                console.log("WARNING: Could not verify pair factory address");
            }
            
            bool isSetup = pair.isSetupComplete();
            console.log("Current setup status:", isSetup);
            
            if (!isSetup) {
                console.log("Setting up LayerZero on Arbitrum Sepolia...");
                try pair.setupLayerZero() {
                    console.log("LayerZero setup complete!");
                } catch Error(string memory reason) {
                    console.log("ERROR setting up LayerZero:", reason);
                    vm.stopBroadcast();
                    return;
                } catch (bytes memory lowLevelData) {
                    console.log("ERROR: Low-level error setting up LayerZero");
                    console.log("Error data length:", lowLevelData.length);
                    vm.stopBroadcast();
                    return;
                }
            } else {
                console.log("LayerZero already configured");
            }
            
            // Show current state
            console.log("Setup complete:", pair.isSetupComplete());
            console.log("Current received value:", pair.getValue());
            console.log("");
        } else if (chainId == 84532) {
            // Base Sepolia
            SimpleOAppBaseNetwork pair = SimpleOAppBaseNetwork(payable(pairAddress));
            
            // Verify it's the correct contract type
            try pair.factory() returns (address factoryAddr) {
                console.log("Pair factory address:", factoryAddr);
                if (factoryAddr != FACTORY_ADDRESS) {
                    console.log("WARNING: Pair factory address doesn't match!");
                }
            } catch {
                console.log("WARNING: Could not verify pair factory address");
            }
            
            bool isSetup = pair.isSetupComplete();
            console.log("Current setup status:", isSetup);
            
            if (!isSetup) {
                console.log("Setting up LayerZero on Base Sepolia...");
                try pair.setupLayerZero() {
                    console.log("LayerZero setup complete!");
                } catch Error(string memory reason) {
                    console.log("ERROR setting up LayerZero:", reason);
                    vm.stopBroadcast();
                    return;
                } catch (bytes memory lowLevelData) {
                    console.log("ERROR: Low-level error setting up LayerZero");
                    console.log("Error data length:", lowLevelData.length);
                    vm.stopBroadcast();
                    return;
                }
            } else {
                console.log("LayerZero already configured");
            }
            
            // Show current state
            console.log("Setup complete:", pair.isSetupComplete());
            console.log("Current received value:", pair.getValue());
            console.log("");
        } else {
            console.log("ERROR: Unsupported network!");
            console.log("This script only works on Arbitrum Sepolia (421614) or Base Sepolia (84532)");
            vm.stopBroadcast();
            return;
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
            console.log("   SimpleOAppBaseNetwork pair = SimpleOAppBaseNetwork(payable(", vm.toString(pairAddress), "));");
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

