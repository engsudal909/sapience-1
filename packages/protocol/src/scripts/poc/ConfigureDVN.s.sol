// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title ConfigureDVN
 * @notice Script to configure DVN settings for LayerZero on the factory (mainnet only)
 * @dev This script configures the default DVN settings that will be applied to all pairs
 * 
 * Addresses from LayerZero documentation:
 * - Arbitrum One: https://docs.layerzero.network/
 * - Base: https://layerzeroscan.com/tools/defaults
 */
contract ConfigureDVN is Script {
    // Factory address (same on both networks)
    address private constant FACTORY_ADDRESS = 0xD3ccEF4741d1C7886321bf732E010455F9c60a1B;
    
    // Arbitrum One mainnet addresses
    // TODO: Update with actual mainnet addresses from LayerZero documentation
    address private constant ARB_MAINNET_SEND_LIB = address(0x975bcD720be66659e3EB3C0e4F1866a3020E493A);      // TODO: Get from docs
    address private constant ARB_MAINNET_RECEIVE_LIB = address(0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6);    // TODO: Get from docs
    address private constant ARB_MAINNET_DVN = address(0x2f55C492897526677C5B68fb199ea31E2c126416);            // TODO: Get from docs
    address private constant ARB_MAINNET_EXECUTOR = address(0x31CAe3B7fB82d847621859fb1585353c5720660D);      // TODO: Get from docs
    
    // Base mainnet addresses
    // TODO: Update with actual mainnet addresses from LayerZero documentation
    address private constant BASE_MAINNET_SEND_LIB = address(0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2);      // TODO: Get from docs
    address private constant BASE_MAINNET_RECEIVE_LIB = address(0xc70AB6f32772f59fBfc23889Caf4Ba3376C84bAf);  // TODO: Get from docs
    address private constant BASE_MAINNET_DVN = address(0x9e059a54699a285714207b43B055483E78FAac25);          // TODO: Get from docs
    address private constant BASE_MAINNET_EXECUTOR = address(0x2CCA08ae69E0C44b18a57Ab2A87644234dAebaE4);      // TODO: Get from docs

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        console.log("========================================");
        console.log("Configure DVN Settings (Mainnet Only)");
        console.log("========================================");
        console.log("Factory address:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("Network:", _getNetworkName(chainId));
        console.log("");

        // Verify we're on mainnet
        if (chainId != 42161 && chainId != 8453) {
            console.log("ERROR: This script only works on Arbitrum One (42161) or Base (8453) mainnet!");
            revert("Unsupported network");
        }

        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        
        // Check if already configured
        bool isArbitrumDVNSet = factory.isDVNConfigSet(OAppFactory.NetworkType.ARBITRUM);
        bool isBaseDVNSet = factory.isDVNConfigSet(OAppFactory.NetworkType.BASE);
        
        console.log("Current configuration:");
        console.log("  Arbitrum DVN configured:", isArbitrumDVNSet);
        console.log("  Base DVN configured:", isBaseDVNSet);
        console.log("");

        // Verify addresses are set
        if (chainId == 42161) {
            if (ARB_MAINNET_SEND_LIB == address(0)) {
                console.log("ERROR: Arbitrum mainnet addresses not configured!");
                console.log("Please update the constants in this script with addresses from:");
                console.log("https://docs.layerzero.network/");
                revert("Addresses not configured");
            }
        } else if (chainId == 8453) {
            if (BASE_MAINNET_SEND_LIB == address(0)) {
                console.log("ERROR: Base mainnet addresses not configured!");
                console.log("Please update the constants in this script with addresses from:");
                console.log("https://layerzeroscan.com/tools/defaults");
                revert("Addresses not configured");
            }
        }

        vm.startBroadcast(deployerPrivateKey);
        
        // Configure based on current network
        if (chainId == 42161) {
            // Arbitrum One - Configure for Arbitrum network type
            if (!isArbitrumDVNSet) {
                console.log("Configuring DVN for Arbitrum One...");
                console.log("  SendLib:", ARB_MAINNET_SEND_LIB);
                console.log("  ReceiveLib:", ARB_MAINNET_RECEIVE_LIB);
                console.log("  DVN:", ARB_MAINNET_DVN);
                console.log("  Executor:", ARB_MAINNET_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.ARBITRUM,
                    ARB_MAINNET_SEND_LIB,
                    ARB_MAINNET_RECEIVE_LIB,
                    ARB_MAINNET_DVN,
                    ARB_MAINNET_EXECUTOR
                );
                
                console.log("SUCCESS: Arbitrum DVN configured!");
            } else {
                console.log("Arbitrum DVN already configured. Skipping...");
            }
            
            // Also configure Base network type (for when pairs are created on Base)
            if (!isBaseDVNSet) {
                console.log("");
                console.log("Configuring DVN for Base (for future pairs)...");
                console.log("  SendLib:", BASE_MAINNET_SEND_LIB);
                console.log("  ReceiveLib:", BASE_MAINNET_RECEIVE_LIB);
                console.log("  DVN:", BASE_MAINNET_DVN);
                console.log("  Executor:", BASE_MAINNET_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.BASE,
                    BASE_MAINNET_SEND_LIB,
                    BASE_MAINNET_RECEIVE_LIB,
                    BASE_MAINNET_DVN,
                    BASE_MAINNET_EXECUTOR
                );
                
                console.log("SUCCESS: Base DVN configured!");
            } else {
                console.log("Base DVN already configured. Skipping...");
            }
            
        } else if (chainId == 8453) {
            // Base - Configure for Base network type
            if (!isBaseDVNSet) {
                console.log("Configuring DVN for Base...");
                console.log("  SendLib:", BASE_MAINNET_SEND_LIB);
                console.log("  ReceiveLib:", BASE_MAINNET_RECEIVE_LIB);
                console.log("  DVN:", BASE_MAINNET_DVN);
                console.log("  Executor:", BASE_MAINNET_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.BASE,
                    BASE_MAINNET_SEND_LIB,
                    BASE_MAINNET_RECEIVE_LIB,
                    BASE_MAINNET_DVN,
                    BASE_MAINNET_EXECUTOR
                );
                
                console.log("SUCCESS: Base DVN configured!");
            } else {
                console.log("Base DVN already configured. Skipping...");
            }
            
            // Also configure Arbitrum network type (for when pairs are created on Arbitrum)
            if (!isArbitrumDVNSet) {
                console.log("");
                console.log("Configuring DVN for Arbitrum One (for future pairs)...");
                console.log("  SendLib:", ARB_MAINNET_SEND_LIB);
                console.log("  ReceiveLib:", ARB_MAINNET_RECEIVE_LIB);
                console.log("  DVN:", ARB_MAINNET_DVN);
                console.log("  Executor:", ARB_MAINNET_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.ARBITRUM,
                    ARB_MAINNET_SEND_LIB,
                    ARB_MAINNET_RECEIVE_LIB,
                    ARB_MAINNET_DVN,
                    ARB_MAINNET_EXECUTOR
                );
                
                console.log("SUCCESS: Arbitrum DVN configured!");
            } else {
                console.log("Arbitrum DVN already configured. Skipping...");
            }
        }
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("========================================");
        console.log("Configuration Complete");
        console.log("========================================");
        console.log("DVN settings are now configured for both network types.");
        console.log("All future pairs created will automatically have DVN configured.");
        console.log("");
        console.log("Next steps:");
        console.log("1. Create pairs using CreatePair.s.sol");
        console.log("2. Pairs will automatically have DVN configured");
        console.log("3. Setup LayerZero on pairs");
        console.log("4. Test cross-chain communication");
        console.log("");
    }
    
    function _getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 42161) return "Arbitrum One";
        if (chainId == 8453) return "Base";
        return "Unknown";
    }
}
