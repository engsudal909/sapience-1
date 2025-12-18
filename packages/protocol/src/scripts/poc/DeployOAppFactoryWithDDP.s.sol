// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title DeployOAppFactoryWithDDP
 * @notice Script to deploy OAppFactory using a Deterministic Deployment Proxy (DDP)
 * @dev This approach uses CREATE2 via a DDP to ensure the same address on all networks.
 * 
 * The DDP (Deterministic Deployment Proxy) is a contract deployed at the same address
 * on all EVM chains. The most common one is at 0x4e59b44847b379578588920cA78FbF26c0B4956C
 * (also known as the "CREATE2 Factory").
 * 
 * This script uses the standard DDP interface:
 * - deploy(bytes memory bytecode, bytes32 salt) -> address
 */
contract DeployOAppFactoryWithDDP is Script {
    // Standard DDP address (same on all EVM chains)
    address private constant DDP = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    
    // Salt for deterministic deployment (change this to get a different address)
    bytes32 private constant DEPLOYMENT_SALT = keccak256("OAppFactory-v1");

    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        console.log("Deploying OAppFactory via DDP...");
        console.log("DDP address:", DDP);
        console.log("Deployment salt:", vm.toString(DEPLOYMENT_SALT));
        console.log("Chain ID:", block.chainid);

        // Calculate the deployment address
        address factoryAddress = _computeAddress(DEPLOYMENT_SALT);
        console.log("Expected factory address:", factoryAddress);

        // Check if already deployed
        if (factoryAddress.code.length > 0) {
            console.log("Factory already deployed at:", factoryAddress);
            return;
        }

        vm.startBroadcast(deployerPrivateKey);

        // Prepare the bytecode with constructor arguments
        bytes memory bytecode = abi.encodePacked(
            type(OAppFactory).creationCode,
            abi.encode(deployer) // initialOwner
        );

        // Deploy via DDP using low-level call
        // The DDP interface is: deploy(bytes memory bytecode, bytes32 salt) returns (address)
        bytes memory callData = abi.encodeWithSignature(
            "deploy(bytes,bytes32)",
            bytecode,
            DEPLOYMENT_SALT
        );
        
        (bool success, bytes memory returnData) = DDP.call(callData);
        require(success, "DDP deployment failed");
        
        // Extract deployed address from return data (first 32 bytes)
        address deployedAddress;
        assembly {
            deployedAddress := mload(add(returnData, 0x20))
        }
        
        require(deployedAddress == factoryAddress, "Deployed address mismatch");
        require(deployedAddress.code.length > 0, "Deployment failed - no code");

        vm.stopBroadcast();

        console.log("OAppFactory deployed to:", deployedAddress);
        console.log("");
        console.log("This address will be the same on all networks!");
    }

    /**
     * @notice Compute the CREATE2 address for the factory
     * @param salt The salt used for deployment
     * @return The address where the contract will be deployed
     */
    function _computeAddress(bytes32 salt) internal view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(OAppFactory).creationCode,
            abi.encode(vm.envAddress("DEPLOYER_ADDRESS"))
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                DDP,
                salt,
                keccak256(bytecode)
            )
        );

        return address(uint160(uint256(hash)));
    }
}

