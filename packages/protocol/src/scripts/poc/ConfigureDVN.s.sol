// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title ConfigureDVN
 * @notice Script to configure DVN settings for LayerZero on the factory
 * @dev This script configures the default DVN settings that will be applied to all pairs
 * 
 * Addresses from LayerZero documentation:
 * - Arbitrum Sepolia: https://docs.layerzero.network/
 * - Base Sepolia: https://testnet.layerzeroscan.com/tools/defaults
 */
contract ConfigureDVN is Script {
    // Factory address (same on both networks)
    address private constant FACTORY_ADDRESS = 0x1847e316e6e4302b23B5Ab5BE078926386D78E95;
    
    // Arbitrum Sepolia addresses
    address private constant ARB_SEPOLIA_SEND_LIB = 0x4f7cd4DA19ABB31b0eC98b9066B9e857B1bf9C0E;      // SendUln302
    address private constant ARB_SEPOLIA_RECEIVE_LIB = 0x75Db67CDab2824970131D5aa9CECfC9F69c69636; // ReceiveUln302
    address private constant ARB_SEPOLIA_DVN = 0xA85BE08A6Ce2771C730661766AACf2c8Bb24C611;         // LZ Dead DVN
    address private constant ARB_SEPOLIA_EXECUTOR = 0x0C77d8d771aB35E2E184E7cE127f19CEd31FF8C0;    // LZ Executor
    
    // Base Sepolia addresses
    address private constant BASE_SEPOLIA_SEND_LIB = 0xC1868e054425D378095A003EcbA3823a5D0135C9;   // SendUln302
    address private constant BASE_SEPOLIA_RECEIVE_LIB = 0x12523de19dc41c91F7d2093E0CFbB76b17012C8d; // ReceiveUln302
    address private constant BASE_SEPOLIA_DVN = 0x78551ADC2553EF1858a558F5300F7018Aad2FA7e;        // LZ Dead DVN
    address private constant BASE_SEPOLIA_EXECUTOR = address(0x8A3D588D9f6AC041476b094f97FF94ec30169d3D);    // LZ Executor

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        console.log("========================================");
        console.log("Configure DVN Settings");
        console.log("========================================");
        console.log("Factory address:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("Network:", _getNetworkName(chainId));
        console.log("");

        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        
        // Check if already configured
        bool isArbitrumDVNSet = factory.isDVNConfigSet(OAppFactory.NetworkType.ARBITRUM);
        bool isBaseDVNSet = factory.isDVNConfigSet(OAppFactory.NetworkType.BASE);
        
        console.log("Current configuration:");
        console.log("  Arbitrum DVN configured:", isArbitrumDVNSet);
        console.log("  Base DVN configured:", isBaseDVNSet);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);
        
        // Configure based on current network
        if (chainId == 421614) {
            // Arbitrum Sepolia - Configure for Arbitrum network type
            if (!isArbitrumDVNSet) {
                console.log("Configuring DVN for Arbitrum Sepolia...");
                console.log("  SendLib:", ARB_SEPOLIA_SEND_LIB);
                console.log("  ReceiveLib:", ARB_SEPOLIA_RECEIVE_LIB);
                console.log("  DVN:", ARB_SEPOLIA_DVN);
                console.log("  Executor:", ARB_SEPOLIA_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.ARBITRUM,
                    ARB_SEPOLIA_SEND_LIB,
                    ARB_SEPOLIA_RECEIVE_LIB,
                    ARB_SEPOLIA_DVN,
                    ARB_SEPOLIA_EXECUTOR
                );
                
                console.log("SUCCESS: Arbitrum DVN configured!");
            } else {
                console.log("Arbitrum DVN already configured. Skipping...");
            }
            
            // Also configure Base network type (for when pairs are created on Base)
            if (!isBaseDVNSet) {
                console.log("");
                console.log("Configuring DVN for Base Sepolia (for future pairs)...");
                console.log("  SendLib:", BASE_SEPOLIA_SEND_LIB);
                console.log("  ReceiveLib:", BASE_SEPOLIA_RECEIVE_LIB);
                console.log("  DVN:", BASE_SEPOLIA_DVN);
                console.log("  Executor:", BASE_SEPOLIA_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.BASE,
                    BASE_SEPOLIA_SEND_LIB,
                    BASE_SEPOLIA_RECEIVE_LIB,
                    BASE_SEPOLIA_DVN,
                    BASE_SEPOLIA_EXECUTOR
                );
                
                console.log("SUCCESS: Base DVN configured!");
            } else {
                console.log("Base DVN already configured. Skipping...");
            }
            
        } else if (chainId == 84532) {
            // Base Sepolia - Configure for Base network type
            if (!isBaseDVNSet) {
                console.log("Configuring DVN for Base Sepolia...");
                console.log("  SendLib:", BASE_SEPOLIA_SEND_LIB);
                console.log("  ReceiveLib:", BASE_SEPOLIA_RECEIVE_LIB);
                console.log("  DVN:", BASE_SEPOLIA_DVN);
                console.log("  Executor:", BASE_SEPOLIA_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.BASE,
                    BASE_SEPOLIA_SEND_LIB,
                    BASE_SEPOLIA_RECEIVE_LIB,
                    BASE_SEPOLIA_DVN,
                    BASE_SEPOLIA_EXECUTOR
                );
                
                console.log("SUCCESS: Base DVN configured!");
            } else {
                console.log("Base DVN already configured. Skipping...");
            }
            
            // Also configure Arbitrum network type (for when pairs are created on Arbitrum)
            if (!isArbitrumDVNSet) {
                console.log("");
                console.log("Configuring DVN for Arbitrum Sepolia (for future pairs)...");
                console.log("  SendLib:", ARB_SEPOLIA_SEND_LIB);
                console.log("  ReceiveLib:", ARB_SEPOLIA_RECEIVE_LIB);
                console.log("  DVN:", ARB_SEPOLIA_DVN);
                console.log("  Executor:", ARB_SEPOLIA_EXECUTOR);
                console.log("");
                
                factory.setDefaultDVNConfigWithDefaults(
                    OAppFactory.NetworkType.ARBITRUM,
                    ARB_SEPOLIA_SEND_LIB,
                    ARB_SEPOLIA_RECEIVE_LIB,
                    ARB_SEPOLIA_DVN,
                    ARB_SEPOLIA_EXECUTOR
                );
                
                console.log("SUCCESS: Arbitrum DVN configured!");
            } else {
                console.log("Arbitrum DVN already configured. Skipping...");
            }
        } else {
            console.log("ERROR: Unsupported network!");
            console.log("This script only works on Arbitrum Sepolia (421614) or Base Sepolia (84532)");
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
        console.log("1. Create pairs using ConfigureAndTest.s.sol");
        console.log("2. Pairs will automatically have DVN configured");
        console.log("3. Setup LayerZero on pairs");
        console.log("4. Test cross-chain communication");
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

