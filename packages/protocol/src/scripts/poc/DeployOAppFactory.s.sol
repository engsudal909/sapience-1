// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title DeployOAppFactory
 * @notice Script to deploy OAppFactory on both networks (Arbitrum and Base)
 * @dev IMPORTANT: For CREATE3 to work correctly, the factory must be deployed at the same address on both networks.
 * 
 * This script uses the same deployer + nonce method. The address is calculated as:
 * address = keccak256(rlp([deployer, nonce]))[12:]
 * 
 * To get the same address on both networks:
 * 1. Use the same deployer address and private key
 * 2. Ensure the deployer has the same nonce on both networks before deployment
 * 
 * For mainnet (Arbitrum One, Base), this method is reliable and simple.
 */
contract DeployOAppFactory is Script {
    // Chain IDs for reference (mainnet only)
    uint256 private constant CHAIN_ID_ARBITRUM = 42161;
    uint256 private constant CHAIN_ID_BASE = 8453;

    function run() external {
        // Load deployer address from environment
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Verify we're using the correct deployer
        require(
            vm.addr(deployerPrivateKey) == deployer,
            "DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY mismatch"
        );

        uint256 currentNonce = vm.getNonce(deployer);
        uint256 chainId = block.chainid;
        
        console.log("========================================");
        console.log("Deploying OAppFactory");
        console.log("========================================");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", chainId);
        console.log("Current nonce:", currentNonce);
        
        // Show network name
        string memory networkName = _getNetworkName(chainId);
        console.log("Network:", networkName);
        
        // Calculate expected address using Foundry's built-in function
        // Note: This requires the nonce to be correct
        address expectedAddress = vm.computeCreateAddress(deployer, currentNonce);
        console.log("Expected factory address:", expectedAddress);
        
        // Check if already deployed
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(expectedAddress)
        }
        if (codeSize > 0) {
            console.log("");
            console.log("Factory already deployed at:", expectedAddress);
            console.log("Code size:", codeSize);
            return;
        }
        
        // Warn about nonce management
        console.log("");
        console.log("IMPORTANT: For same address on both networks:");
        console.log("  - Ensure deployer has the SAME nonce on both networks");
        console.log("  - Current nonce:", currentNonce);
        console.log("");
        console.log("To check nonce on other network:");
        if (chainId == CHAIN_ID_ARBITRUM) {
            console.log("  - Base Mainnet: https://basescan.org/address/", vm.toString(deployer));
        } else {
            console.log("  - Arbitrum Mainnet: https://arbiscan.io/address/", vm.toString(deployer));
        }
        console.log("");

        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy factory with deployer as initial owner
        OAppFactory factory = new OAppFactory(deployer);
        
        vm.stopBroadcast();

        address deployedAddress = address(factory);
        uint256 deployedCodeSize;
        assembly {
            deployedCodeSize := extcodesize(deployedAddress)
        }
        
        console.log("========================================");
        console.log("Deployment Complete");
        console.log("========================================");
        console.log("Factory deployed to:", deployedAddress);
        console.log("Code size:", deployedCodeSize);
        
        if (deployedAddress == expectedAddress) {
            console.log("SUCCESS: Address matches expected!");
        } else {
            console.log("WARNING: Address does not match expected!");
            console.log("Expected:", expectedAddress);
            console.log("Actual:", deployedAddress);
        }
        
        console.log("");
        console.log("Next steps:");
        console.log("1. Deploy on the other network with the SAME nonce");
        console.log("2. Verify both factories are at the same address");
        console.log("3. Configure DVN settings on both networks");
        console.log("4. Create pairs using the same salt on both networks");
        console.log("");
    }
    
    
    /**
     * @notice Get network name from chain ID
     */
    function _getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == CHAIN_ID_ARBITRUM) return "Arbitrum One";
        if (chainId == CHAIN_ID_BASE) return "Base";
        return "Unknown";
    }
}

