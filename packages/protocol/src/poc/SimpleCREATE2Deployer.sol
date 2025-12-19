// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SimpleCREATE2Deployer
 * @notice Simple contract that can deploy other contracts using CREATE2
 * @dev This contract should be deployed at the same address on all networks
 *      using the same deployer + nonce method. Once deployed, it can be used
 *      to deploy other contracts deterministically via CREATE2.
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

