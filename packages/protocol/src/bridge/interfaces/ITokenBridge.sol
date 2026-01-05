// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {TokenBridgeTypes} from "../TokenBridgeTypes.sol";
import {BridgeTypes} from "../BridgeTypes.sol";

/**
 * @title ITokenBridge
 * @notice Interface for the TokenBridge contract
 */
interface ITokenBridge {
    // Events
    event TokenPairCreated(
        address indexed pmToken,
        address indexed smToken,
        string name,
        string symbol,
        bytes32 salt
    );
    
    event BridgeInitiated(
        bytes32 indexed transferId,
        address indexed token,
        address indexed user,
        uint256 amount,
        bool isFromPM
    );
    
    event BridgeCompleted(
        bytes32 indexed transferId,
        address indexed token,
        address indexed user,
        uint256 amount
    );
    
    event BridgeFailed(
        bytes32 indexed transferId,
        address indexed token,
        address indexed user,
        uint256 amount
    );
    
    event BridgeRetried(
        bytes32 indexed transferId,
        uint256 retryCount
    );
    
    event TokenPairAcknowledged(
        address indexed token,
        bytes32 salt
    );

    // Functions
    function createTokenPair(
        string memory name,
        string memory symbol,
        uint8 decimals,
        bytes32 salt
    ) external;

    function bridgeTokens(address token, uint256 amount) external;
    function retryBridge(bytes32 transferId) external;
    function markTransferFailed(bytes32 transferId) external;
    function refundFailedTransfer(bytes32 transferId) external;

    // View functions
    function getTokenPair(address token) external view returns (TokenBridgeTypes.TokenPair memory);
    function getBridgeTransfer(bytes32 transferId) external view returns (TokenBridgeTypes.BridgeTransfer memory);
    function getEscrowedBalance(address token, address user) external view returns (uint256);
}

