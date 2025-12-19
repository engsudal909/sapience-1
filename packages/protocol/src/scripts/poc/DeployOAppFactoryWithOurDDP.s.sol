// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleCREATE2Deployer} from "../../poc/SimpleCREATE2Deployer.sol";

/**
 * @title DeployOAppFactoryWithOurDDP
 * @notice Script to deploy OAppFactory using our own SimpleCREATE2Deployer
 * @dev This script uses a SimpleCREATE2Deployer that was previously deployed
 *      at the same address on both networks. NO NONCE MANAGEMENT NEEDED!
 * 
 * Prerequisites:
 * 1. SimpleCREATE2Deployer must be deployed at the same address on both networks
 * 2. Use DeploySimpleCREATE2Deployer.s.sol to deploy it (one-time setup with nonce matching)
 * 
 * After the one-time setup, this script can be used on any network without
 * worrying about nonces - the factory will be at the same address on both networks.
 */
contract DeployOAppFactoryWithOurDDP is Script {
    // Address of SimpleCREATE2Deployer (same on both networks after one-time setup)
    // TODO: Update this after deploying SimpleCREATE2Deployer using DeploySimpleCREATE2Deployer.s.sol
    address private constant OUR_DDP_ADDRESS = address(0xc1525CF7d9b9ed81Ce277c2Bf96fb1E0e85E1e7E); // Update after deployment
    
    // Salt for deploying the factory
    bytes32 private constant FACTORY_SALT = keccak256("OAppFactory-OurDDP-v1");

    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 chainId = block.chainid;
        
        // Verify we're on mainnet
        if (chainId != 42161 && chainId != 8453) {
            console.log("ERROR: This script only works on Arbitrum One (42161) or Base (8453) mainnet!");
            revert("Unsupported network");
        }
        
        // Validate deployer address
        if (deployer == address(0)) {
            console.log("ERROR: DEPLOYER_ADDRESS cannot be address(0)!");
            revert("Invalid deployer address");
        }
        
        // Validate DDP address
        if (OUR_DDP_ADDRESS == address(0)) {
            console.log("ERROR: OUR_DDP_ADDRESS is not set!");
            console.log("");
            console.log("Please follow these steps:");
            console.log("1. Deploy SimpleCREATE2Deployer using DeploySimpleCREATE2Deployer.s.sol");
            console.log("   (This requires matching nonces ONCE - see that script for details)");
            console.log("2. Note the deployed address (should be same on both networks)");
            console.log("3. Update OUR_DDP_ADDRESS in this script with that address");
            console.log("");
            revert("DDP address not configured");
        }
        
        console.log("========================================");
        console.log("Deploying OAppFactory via Our DDP");
        console.log("========================================");
        console.log("Our DDP address:", OUR_DDP_ADDRESS);
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", chainId);
        console.log("Network:", chainId == 42161 ? "Arbitrum One" : "Base");
        console.log("");
        
        // Verify DDP exists
        uint256 ddpCodeSize = OUR_DDP_ADDRESS.code.length;
        if (ddpCodeSize == 0) {
            console.log("ERROR: SimpleCREATE2Deployer not deployed at", OUR_DDP_ADDRESS);
            console.log("Please deploy it first using DeploySimpleCREATE2Deployer.s.sol");
            revert("DDP not deployed");
        }
        console.log("DDP verified - code size:", ddpCodeSize);
        
        SimpleCREATE2Deployer ddp = SimpleCREATE2Deployer(OUR_DDP_ADDRESS);
        
        // Prepare factory bytecode
        bytes memory factoryBytecode = abi.encodePacked(
            type(OAppFactory).creationCode,
            abi.encode(deployer) // initialOwner
        );
        bytes32 factoryBytecodeHash = keccak256(factoryBytecode);
        
        // Compute expected factory address
        address expectedFactoryAddress = ddp.computeAddress(FACTORY_SALT, factoryBytecodeHash);
        console.log("Factory salt:", vm.toString(FACTORY_SALT));
        console.log("Expected factory address:", expectedFactoryAddress);
        
        // Check if factory already deployed
        if (expectedFactoryAddress.code.length > 0) {
            console.log("");
            console.log("Factory already deployed at:", expectedFactoryAddress);
            return;
        }
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("");
        console.log("Deploying OAppFactory via CREATE2...");
        address deployedFactory = ddp.deploy(FACTORY_SALT, factoryBytecode);
        
        vm.stopBroadcast();
        
        // Verify deployment
        uint256 codeSize = deployedFactory.code.length;
        console.log("");
        console.log("========================================");
        console.log("Deployment Complete");
        console.log("========================================");
        console.log("Factory deployed at:", deployedFactory);
        console.log("Code size:", codeSize);
        
        if (deployedFactory == expectedFactoryAddress) {
            console.log("SUCCESS: Address matches expected!");
        } else {
            console.log("WARNING: Address mismatch!");
            console.log("Expected:", expectedFactoryAddress);
            console.log("Actual:", deployedFactory);
        }
        
        if (codeSize == 0) {
            console.log("");
            console.log("ERROR: Factory has 0 bytes of code!");
            console.log("The constructor may have reverted.");
            revert("Factory deployment failed");
        }
        
        console.log("");
        console.log("SUCCESS! Factory deployed at:", deployedFactory);
        console.log("Deploy on the other network - it will be at the same address!");
        console.log("(No nonce management needed - just run the same script!)");
        console.log("");
    }
}

