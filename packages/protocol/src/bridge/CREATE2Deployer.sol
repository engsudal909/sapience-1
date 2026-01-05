// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title CREATE2Deployer
 * @notice Helper library for deploying contracts at deterministic addresses using CREATE2
 */
library CREATE2Deployer {
    /**
     * @notice Computes the address that a contract will be deployed to using CREATE2
     * @param deployer Address of the deployer contract
     * @param salt Salt for CREATE2 deployment
     * @param bytecodeHash Hash of the contract bytecode (keccak256 of creation bytecode)
     * @return The address where the contract will be deployed
     */
    function computeAddress(
        address deployer,
        bytes32 salt,
        bytes32 bytecodeHash
    ) internal pure returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                deployer,
                salt,
                bytecodeHash
            )
        );
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Deploys a contract using CREATE2
     * @param bytecode Contract creation bytecode
     * @param salt Salt for CREATE2 deployment
     * @return deployedAddress The address where the contract was deployed
     */
    function deploy(bytes memory bytecode, bytes32 salt) internal returns (address deployedAddress) {
        assembly {
            deployedAddress := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        require(deployedAddress != address(0), "CREATE2 deployment failed");
    }
}

