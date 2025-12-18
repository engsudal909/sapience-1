// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CREATE3
 * @notice Library for deploying contracts to deterministic addresses using CREATE3
 * @dev Based on the CREATE3 pattern for predictable contract addresses across chains
 *      This implementation uses an intermediate deployer contract pattern
 */
library CREATE3 {
    error DeploymentFailed();

    /**
     * @notice Gets the CREATE3 address for a given salt
     * @param salt The salt to use for deployment
     * @return The address where the contract will be deployed
     */
    function getDeployed(bytes32 salt) internal view returns (address) {
        // First, compute the address of the deployer contract using CREATE2
        address deployer = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            salt,
                            keccak256(type(CREATE3Deployer).creationCode)
                        )
                    )
                )
            )
        );

        // Then compute the final address using CREATE (not CREATE2)
        // The deployer will use CREATE to deploy the actual contract
        // Formula: keccak256(0xd6, 0x94, deployer, 0x01) << 96
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xd6),
                                bytes1(0x94),
                                deployer,
                                bytes1(0x01)
                            )
                        )
                    )
                )
            );
    }

    /**
     * @notice Deploys a contract using CREATE3
     * @param salt The salt to use for deployment
     * @param bytecode The bytecode of the contract to deploy
     * @return deployed The address of the deployed contract
     */
    function deploy(bytes32 salt, bytes memory bytecode) internal returns (address deployed) {
        deployed = getDeployed(salt);

        if (deployed.code.length != 0) {
            return deployed;
        }

        // Deploy the intermediate deployer contract using CREATE2
        bytes memory deployerBytecode = type(CREATE3Deployer).creationCode;
        address deployerAddress;

        assembly {
            deployerAddress := create2(0, add(deployerBytecode, 0x20), mload(deployerBytecode), salt)
            if iszero(deployerAddress) {
                revert(0, 0)
            }
        }

        // Use the deployer to deploy the actual contract via CREATE
        // The deployer contract has a deploy function that uses CREATE
        bytes memory callData = abi.encodeWithSignature("deploy(bytes)", bytecode);
        (bool success, bytes memory returnData) = deployerAddress.call(callData);
        if (!success) revert DeploymentFailed();

        // Extract the deployed address from return data
        assembly {
            deployed := mload(add(returnData, 0x20))
        }

        // Verify the deployment was successful
        if (deployed == address(0) || deployed.code.length == 0) {
            revert DeploymentFailed();
        }

        return deployed;
    }
}

/**
 * @title CREATE3Deployer
 * @notice Intermediate contract used by CREATE3 to deploy contracts
 * @dev This contract is deployed via CREATE2 and then uses CREATE to deploy the target contract
 */
contract CREATE3Deployer {
    /**
     * @notice Deploys a contract using CREATE
     * @param bytecode The bytecode of the contract to deploy
     * @return deployed The address of the deployed contract
     */
    function deploy(bytes memory bytecode) external returns (address deployed) {
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(deployed) {
                revert(0, 0)
            }
        }
    }
}

