// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

/// @notice Minimal Pyth Pro (Lazer) interface needed to verify updates on EVM.
/// @dev The canonical implementation is `PythLazer` in pyth-network/pyth-crosschain.
interface IPythLazer {
    /// @notice Verification fee (wei) required by `verifyUpdate`.
    /// @dev In the reference implementation this is a public variable (`verification_fee`).
    function verification_fee() external view returns (uint256);

    /// @notice Verifies a Pyth Pro update and returns the signed payload plus the signer address.
    /// @dev The implementation returns `bytes calldata` for the payload, but consumers can receive it as `bytes memory`.
    function verifyUpdate(bytes calldata update) external payable returns (bytes memory payload, address signer);
}


