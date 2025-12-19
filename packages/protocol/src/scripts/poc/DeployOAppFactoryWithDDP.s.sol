// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title DeployOAppFactoryWithDDP
 * @notice Script to deploy OAppFactory using a Deterministic Deployment Proxy (DDP) - Mainnet Only
 * @dev This approach uses CREATE2 via a DDP to ensure the same address on all networks.
 * 
 * The DDP (Deterministic Deployment Proxy) is a contract deployed at the same address
 * on all EVM chains. The most common one is at 0x4e59b44847b379578588920cA78FbF26c0B4956C
 * (also known as the "CREATE2 Factory").
 * 
 * This script uses the standard DDP interface:
 * - deploy(bytes memory bytecode, uint256 salt) -> address
 * 
 * Note: The DDP at 0x4e59b44847b379578588920cA78FbF26c0B4956C uses uint256 salt,
 * not bytes32. This is the standard CREATE2 Factory by Nick Johnson.
 * 
 * IMPORTANT: This script is for mainnet only (Arbitrum One and Base).
 */
contract DeployOAppFactoryWithDDP is Script {
    // Standard DDP address (same on all EVM chains)
    address private constant DDP = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    
    // Salt for deterministic deployment (change this to get a different address)
    // Note: DDP uses uint256 salt, so we convert bytes32 to uint256
    bytes32 private constant DEPLOYMENT_SALT_BYTES32 = keccak256("OAppFactory-v1");
    uint256 private constant DEPLOYMENT_SALT = uint256(keccak256("OAppFactory-v1"));

    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 chainId = block.chainid;
        
        // Verify we're on mainnet
        if (chainId != 42161 && chainId != 8453) {
            console.log("ERROR: This script only works on Arbitrum One (42161) or Base (8453) mainnet!");
            console.log("Current chain ID:", chainId);
            revert("Unsupported network");
        }
        
        console.log("========================================");
        console.log("Deploying OAppFactory via DDP (Mainnet)");
        console.log("========================================");
        console.log("DDP address:", DDP);
        console.log("Deployment salt (uint256):", DEPLOYMENT_SALT);
        console.log("Chain ID:", chainId);
        console.log("Network:", chainId == 42161 ? "Arbitrum One" : "Base");
        console.log("");

        // Calculate the deployment address
        address factoryAddress = _computeAddress(DEPLOYMENT_SALT);
        console.log("Expected factory address:", factoryAddress);
        
        // Verify DDP exists
        uint256 ddpCodeSize;
        assembly {
            ddpCodeSize := extcodesize(DDP)
        }
        if (ddpCodeSize == 0) {
            console.log("");
            console.log("ERROR: DDP not deployed on this network!");
            console.log("The DDP at", DDP, "does not exist on chain ID", block.chainid);
            console.log("");
            console.log("Options:");
            console.log("1. Deploy the DDP first (see: https://github.com/Arachnid/deterministic-deployment-proxy)");
            console.log("2. Use DeployOAppFactory.s.sol with same deployer + nonce method");
            console.log("");
            revert("DDP not deployed on this network");
        }
        console.log("DDP verified - code size:", ddpCodeSize);

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
        
        console.log("Bytecode length:", bytecode.length);
        console.log("Bytecode hash:", vm.toString(keccak256(bytecode)));

        address deployedAddress;
        bool success;
        bytes memory returnData;

        // Try different DDP interfaces - some networks use different signatures
        // Interface 1: deploy(bytes, uint256) - Standard Nick Johnson DDP
        console.log("Trying interface 1: deploy(bytes, uint256)");
        bytes memory callData1 = abi.encodeWithSignature(
            "deploy(bytes,uint256)",
            bytecode,
            DEPLOYMENT_SALT
        );
        
        (success, returnData) = DDP.call(callData1);
        if (success) {
            console.log("Interface 1 succeeded!");
            console.log("Return data length:", returnData.length);
            if (returnData.length > 0) {
                console.log("Return data (hex):", vm.toString(returnData));
            }
        } else {
            console.log("Interface 1 failed, trying interface 2...");
            // Interface 2: create2(uint256, bytes) - Some DDPs use this order
            bytes memory callData2 = abi.encodeWithSignature(
                "create2(uint256,bytes)",
                DEPLOYMENT_SALT,
                bytecode
            );
            
            (success, returnData) = DDP.call(callData2);
            if (success) {
                console.log("Interface 2 succeeded!");
            } else {
                console.log("Interface 2 failed, trying interface 3...");
                // Interface 3: create2(bytes32, bytes) - Alternative interface
                bytes32 saltBytes32 = bytes32(DEPLOYMENT_SALT);
                bytes memory callData3 = abi.encodeWithSignature(
                    "create2(bytes32,bytes)",
                    saltBytes32,
                    bytecode
                );
                
                (success, returnData) = DDP.call(callData3);
                if (success) {
                    console.log("Interface 3 succeeded!");
                }
            }
        }
        
        if (!success) {
            // Try to get error message
            if (returnData.length > 0) {
                console.log("DDP call failed. Return data length:", returnData.length);
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            }
            revert("DDP deployment failed - tried all known interfaces");
        }
        
        // Extract deployed address from return data
        // The DDP returns the address - it might be in different formats
        if (returnData.length == 0) {
            // If no return data, check if the expected address has code
            deployedAddress = factoryAddress;
            console.log("No return data from DDP, checking expected address...");
        } else if (returnData.length == 20) {
            // Direct address (20 bytes)
            assembly {
                deployedAddress := mload(add(returnData, 0x20))
                deployedAddress := and(deployedAddress, 0xffffffffffffffffffffffffffffffffffffffff)
            }
        } else if (returnData.length >= 32) {
            // Address padded to 32 bytes (standard ABI encoding)
            assembly {
                // Load the first 32 bytes (which contains the address, right-aligned)
                deployedAddress := mload(add(returnData, 0x20))
                // Mask to get only the address (20 bytes = 160 bits)
                deployedAddress := and(deployedAddress, 0xffffffffffffffffffffffffffffffffffffffff)
            }
        } else {
            // Try to extract address from shorter return data
            console.log("WARNING: Unexpected return data length:", returnData.length);
            console.log("Return data (hex):", vm.toString(returnData));
            // Try to extract address anyway (might be right-aligned)
            assembly {
                let dataLength := mload(returnData)
                if gt(dataLength, 0) {
                    // Load the data and mask to address size
                    let dataPtr := add(returnData, 0x20)
                    deployedAddress := mload(dataPtr)
                    deployedAddress := and(deployedAddress, 0xffffffffffffffffffffffffffffffffffffffff)
                }
            }
        }
        
        console.log("Deployed address from DDP:", deployedAddress);
        console.log("Return data length:", returnData.length);
        if (returnData.length > 0) {
            console.log("Return data (hex):", vm.toString(returnData));
        }
        console.log("Expected address (uint256 salt):", factoryAddress);
        
        // Check if the deployed address has code
        uint256 deployedCodeSize;
        assembly {
            deployedCodeSize := extcodesize(deployedAddress)
        }
        console.log("Code size at deployed address:", deployedCodeSize);
        
        if (deployedCodeSize == 0 && deployedAddress != address(0)) {
            console.log("");
            console.log("WARNING: Contract deployed but has 0 bytes of code!");
            console.log("This means the constructor reverted during deployment.");
            console.log("The address", deployedAddress, "was created but the constructor failed.");
            console.log("");
            console.log("Possible causes:");
            console.log("1. Constructor parameters are incorrect");
            console.log("2. Constructor is calling external contracts that don't exist");
            console.log("3. Constructor is reverting due to validation errors");
            console.log("");
            revert("Constructor reverted during deployment");
        }
        
        // Recalculate expected address with bytes32 salt (some DDPs use this internally)
        bytes32 saltBytes32 = bytes32(DEPLOYMENT_SALT);
        address expectedAddressBytes32 = _computeAddressBytes32(saltBytes32);
        console.log("Expected address (bytes32 salt):", expectedAddressBytes32);
        
        // Also calculate what the address should be if DDP uses create2 directly
        address expectedCreate2 = _computeCreate2Address(saltBytes32, bytecode);
        console.log("Expected address (create2 formula):", expectedCreate2);
        
        // Check which address matches (if any)
        address finalAddress = address(0);
        if (deployedAddress == factoryAddress) {
            finalAddress = factoryAddress;
            console.log("Address matches (uint256 salt format)");
        } else if (deployedAddress == expectedAddressBytes32) {
            finalAddress = expectedAddressBytes32;
            console.log("Address matches (bytes32 salt format)");
        } else if (deployedAddress == expectedCreate2) {
            finalAddress = expectedCreate2;
            console.log("Address matches (create2 formula)");
        } else {
            // Check if the deployed address has code (deployment might have succeeded anyway)
            uint256 codeSize;
            assembly {
                codeSize := extcodesize(deployedAddress)
            }
            
            if (codeSize > 0) {
                console.log("");
                console.log("WARNING: Address mismatch, but contract has code!");
                console.log("The DDP on this network may use a different interface.");
                console.log("Deployed address:", deployedAddress);
                console.log("Code size:", codeSize);
                console.log("");
                console.log("This might still work if you use the same DDP interface");
                console.log("on all networks. Verify the deployed contract manually.");
                finalAddress = deployedAddress;
            } else {
                console.log("");
                console.log("ERROR: Address mismatch and no code at deployed address!");
                console.log("This DDP interface may not be compatible.");
                console.log("");
                console.log("Options:");
                console.log("1. Try DeployOAppFactory.s.sol with same deployer + nonce");
                console.log("2. Manually verify the DDP interface on this network");
                console.log("3. Deploy a compatible DDP first");
                revert("Deployed address mismatch and no code");
            }
        }
        
        require(finalAddress.code.length > 0, "Deployment failed - no code at final address");
        
        console.log("");
        console.log("Success! Factory deployed to:", finalAddress);

        vm.stopBroadcast();

        console.log("");
        console.log("OAppFactory deployed to:", finalAddress);
        console.log("");
        console.log("NOTE: If this address differs from expected, ensure you use");
        console.log("the same DDP interface and salt format on all networks!");
    }

    /**
     * @notice Compute the CREATE2 address for the factory
     * @param salt The salt used for deployment (uint256)
     * @return The address where the contract will be deployed
     */
    function _computeAddress(uint256 salt) internal view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(OAppFactory).creationCode,
            abi.encode(vm.envAddress("DEPLOYER_ADDRESS"))
        );

        // DDP uses uint256 salt, so we need to encode it properly
        // The CREATE2 formula is: keccak256(0xff || deployer || salt || keccak256(bytecode))
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                DDP,
                salt,  // uint256 is 32 bytes, so this should work
                keccak256(bytecode)
            )
        );

        return address(uint160(uint256(hash)));
    }
    
    /**
     * @notice Compute the CREATE2 address using bytes32 salt (alternative format)
     * @param salt The salt used for deployment (bytes32)
     * @return The address where the contract will be deployed
     */
    function _computeAddressBytes32(bytes32 salt) internal view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(OAppFactory).creationCode,
            abi.encode(vm.envAddress("DEPLOYER_ADDRESS"))
        );

        // CREATE2 formula with bytes32 salt
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
    
    /**
     * @notice Compute the CREATE2 address using the standard CREATE2 formula
     * @param salt The salt used for deployment (bytes32)
     * @param bytecode The bytecode to deploy
     * @return The address where the contract will be deployed
     */
    function _computeCreate2Address(bytes32 salt, bytes memory bytecode) internal view returns (address) {
        // Standard CREATE2 formula: keccak256(0xff || deployer || salt || keccak256(bytecode))
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

