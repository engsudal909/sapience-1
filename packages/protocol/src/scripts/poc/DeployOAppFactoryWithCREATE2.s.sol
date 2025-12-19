// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title Simple CREATE2 Deployer
 * @notice Contract that can deploy other contracts using CREATE2
 */
contract SimpleCREATE2Deployer {
    /**
     * @notice Deploy a contract using CREATE2
     * @param salt The salt for CREATE2
     * @param bytecode The bytecode to deploy
     * @return deployed The address of the deployed contract
     */
    function deploy(bytes32 salt, bytes memory bytecode) external returns (address deployed) {
        assembly {
            deployed := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(deployed) {
                revert(0, 0)
            }
        }
    }
    
    /**
     * @notice Compute the CREATE2 address
     * @param salt The salt for CREATE2
     * @param bytecodeHash The keccak256 hash of the bytecode
     * @return The address where the contract will be deployed
     */
    function computeAddress(bytes32 salt, bytes32 bytecodeHash) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                bytecodeHash
            )
        );
        return address(uint160(uint256(hash)));
    }
}

/**
 * @title DeployOAppFactoryWithCREATE2
 * @notice Script to deploy OAppFactory using CREATE2 directly (no external DDP)
 * @dev This approach:
 * 1. First deploys a simple CREATE2 deployer contract (using same deployer + nonce)
 * 2. Then uses that deployer to deploy OAppFactory via CREATE2
 * 
 * This ensures the factory is at the same address on both networks because:
 * - The deployer contract is deployed at the same address (same deployer + nonce)
 * - The factory is deployed via CREATE2 with the same salt
 */
contract DeployOAppFactoryWithCREATE2 is Script {
    
    // Salt for deploying the factory
    bytes32 private constant FACTORY_SALT = keccak256("OAppFactory-CREATE2-v1");

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
        
        // Validate deployer address
        if (deployer == address(0)) {
            console.log("ERROR: DEPLOYER_ADDRESS cannot be address(0)!");
            revert("Invalid deployer address");
        }
        
        console.log("========================================");
        console.log("Deploying OAppFactory via CREATE2");
        console.log("========================================");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", chainId);
        console.log("Network:", chainId == 42161 ? "Arbitrum One" : "Base");
        console.log("");
        
        uint256 currentNonce = vm.getNonce(deployer);
        console.log("Current nonce:", currentNonce);
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Step 1: Deploy the CREATE2 deployer contract
        // This will be at the same address on both networks if we use the same nonce
        console.log("Step 1: Deploying SimpleCREATE2Deployer contract...");
        address expectedDeployerAddress = vm.computeCreateAddress(deployer, currentNonce);
        console.log("Expected SimpleCREATE2Deployer address:", expectedDeployerAddress);
        
        // Check if already deployed
        if (expectedDeployerAddress.code.length > 0) {
            console.log("SimpleCREATE2Deployer already deployed!");
        } else {
            SimpleCREATE2Deployer create2Deployer = new SimpleCREATE2Deployer();
            address deployedDeployerAddress = address(create2Deployer);
            console.log("SimpleCREATE2Deployer deployed at:", deployedDeployerAddress);
            
            if (deployedDeployerAddress != expectedDeployerAddress) {
                console.log("WARNING: Address mismatch!");
                console.log("Expected:", expectedDeployerAddress);
                console.log("Actual:", deployedDeployerAddress);
            }
        }
        
        SimpleCREATE2Deployer create2Deployer = SimpleCREATE2Deployer(expectedDeployerAddress);
        
        // Step 2: Prepare factory bytecode
        bytes memory factoryBytecode = abi.encodePacked(
            type(OAppFactory).creationCode,
            abi.encode(deployer) // initialOwner
        );
        bytes32 factoryBytecodeHash = keccak256(factoryBytecode);
        
        // Step 3: Compute expected factory address
        address expectedFactoryAddress = create2Deployer.computeAddress(FACTORY_SALT, factoryBytecodeHash);
        console.log("");
        console.log("Step 2: Computing factory address...");
        console.log("Factory salt:", vm.toString(FACTORY_SALT));
        console.log("Expected factory address:", expectedFactoryAddress);
        
        // Check if factory already deployed
        if (expectedFactoryAddress.code.length > 0) {
            console.log("");
            console.log("Factory already deployed at:", expectedFactoryAddress);
            vm.stopBroadcast();
            return;
        }
        
        // Step 4: Deploy factory using CREATE2
        console.log("");
        console.log("Step 3: Deploying OAppFactory via CREATE2...");
        address deployedFactory = create2Deployer.deploy(FACTORY_SALT, factoryBytecode);
        
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
        console.log("Next steps:");
        console.log("1. Deploy SimpleCREATE2Deployer on the other network with the SAME nonce");
        console.log("2. Deploy factory on the other network (will be at the same address)");
        console.log("3. Verify both factories are at the same address");
        console.log("");
    }
}

