// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {SimpleCREATE2Deployer} from "../../poc/SimpleCREATE2Deployer.sol";

/**
 * @title DeploySimpleCREATE2Deployer
 * @notice Script to deploy SimpleCREATE2Deployer on both networks (one-time setup)
 * @dev IMPORTANT: This only needs to be done ONCE. After this, you can use
 *      DeployOAppFactoryWithOurDDP.s.sol which doesn't require nonce management.
 * 
 * Steps:
 * 1. Deploy this on Arbitrum One (note the address)
 * 2. Deploy this on Base with the SAME nonce (will get same address)
 * 3. After this, you can use DeployOAppFactoryWithOurDDP.s.sol without nonce management
 */
contract DeploySimpleCREATE2Deployer is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 chainId = block.chainid;
        
        // Verify we're on mainnet
        if (chainId != 42161 && chainId != 8453) {
            console.log("ERROR: This script only works on Arbitrum One (42161) or Base (8453) mainnet!");
            revert("Unsupported network");
        }
        
        uint256 currentNonce = vm.getNonce(deployer);
        address expectedAddress = vm.computeCreateAddress(deployer, currentNonce);
        
        console.log("========================================");
        console.log("Deploying SimpleCREATE2Deployer");
        console.log("========================================");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", chainId);
        console.log("Network:", chainId == 42161 ? "Arbitrum One" : "Base");
        console.log("Current nonce:", currentNonce);
        console.log("Expected address:", expectedAddress);
        console.log("");
        
        // Check if already deployed
        if (expectedAddress.code.length > 0) {
            console.log("SimpleCREATE2Deployer already deployed at:", expectedAddress);
            console.log("You can now use DeployOAppFactoryWithOurDDP.s.sol");
            return;
        }
        
        console.log("IMPORTANT: For same address on both networks:");
        console.log("  - Ensure deployer has the SAME nonce on both networks");
        console.log("  - Current nonce:", currentNonce);
        console.log("");
        console.log("To check nonce on other network:");
        if (chainId == 42161) {
            console.log("  - Base: cast nonce", deployer, "--rpc-url $BASE_MAINNET_RPC");
        } else {
            console.log("  - Arbitrum: cast nonce", deployer, "--rpc-url $ARBITRUM_MAINNET_RPC");
        }
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        SimpleCREATE2Deployer deployerContract = new SimpleCREATE2Deployer();
        
        vm.stopBroadcast();
        
        address deployedAddress = address(deployerContract);
        console.log("========================================");
        console.log("Deployment Complete");
        console.log("========================================");
        console.log("SimpleCREATE2Deployer deployed to:", deployedAddress);
        
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
        console.log("2. Verify both are at the same address");
        console.log("3. Use DeployOAppFactoryWithOurDDP.s.sol (no nonce management needed!)");
        console.log("");
    }
}

