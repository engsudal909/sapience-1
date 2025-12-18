// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title DeployOAppFactory
 * @notice Script to deploy OAppFactory on both networks (Arbitrum and Base)
 * @dev IMPORTANT: For CREATE3 to work correctly, the factory must be deployed at the same address on both networks.
 * 
 * Options to achieve same address:
 * 1. Use the same deployer address and nonce on both networks
 * 2. Use a Deterministic Deployment Proxy (DDP) - recommended
 * 3. Use CREATE2 with a known salt
 * 
 * This script uses option 1 (same deployer + nonce) for simplicity.
 * For production, consider using a DDP like the one at 0x4e59b44847b379578588920cA78FbF26c0B4956C
 */
contract DeployOAppFactory is Script {
    function run() external {
        // Load deployer address from environment
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Verify we're using the correct deployer
        require(
            vm.addr(deployerPrivateKey) == deployer,
            "DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY mismatch"
        );

        console.log("Deploying OAppFactory...");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Deployer nonce:", vm.getNonce(deployer));

        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy factory with deployer as initial owner
        OAppFactory factory = new OAppFactory(deployer);
        
        vm.stopBroadcast();

        console.log("OAppFactory deployed to:", address(factory));
        console.log("");
        console.log("IMPORTANT: To deploy on the other network with the same address:");
        console.log("1. Use the same deployer address and private key");
        console.log("2. Ensure the deployer has the same nonce on both networks");
        console.log("3. Or use a Deterministic Deployment Proxy (DDP)");
        console.log("");
        console.log("To check nonce on each network:");
        console.log("  - Arbitrum: Check deployer nonce on arbiscan.io");
        console.log("  - Base: Check deployer nonce on basescan.org");
        console.log("");
        console.log("If nonces differ, you can:");
        console.log("  - Send transactions to match nonces, OR");
        console.log("  - Use a DDP for deterministic deployment");
    }
}

