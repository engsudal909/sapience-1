// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title TokenBridgeTypes
 * @notice Shared structs and types for token bridge contracts
 */
library TokenBridgeTypes {
    /**
     * @notice Status of a bridge transfer
     */
    enum BridgeStatus {
        Pending,      // Transfer initiated, waiting for remote confirmation
        Completed,    // Transfer completed successfully
        Failed,       // Transfer failed (timeout or error)
        Retrying      // Transfer is being retried
    }

    /**
     * @notice Information about an in-flight bridge transfer
     */
    struct BridgeTransfer {
        bytes32 transferId;        // Unique identifier for this transfer
        address token;             // Token address on source chain
        address user;              // User initiating the transfer
        uint256 amount;            // Amount being transferred
        uint256 timestamp;         // When the transfer was initiated
        uint256 timeout;           // Timestamp when transfer times out
        BridgeStatus status;       // Current status of the transfer
        bool isFromPM;            // true if transferring FROM PM side, false if FROM SM side
        uint256 retryCount;        // Number of retries attempted
    }

    /**
     * @notice Token pair information
     */
    struct TokenPair {
        address pmToken;           // Token address on PM side
        address smToken;           // Token address on SM side
        bool exists;               // Whether this pair exists
        bool acknowledged;         // Whether remote side has acknowledged creation
    }

    /**
     * @notice Parameters for creating a new token pair
     */
    struct CreateTokenPairParams {
        string name;               // Token name
        string symbol;             // Token symbol
        uint8 decimals;            // Token decimals
        bytes32 salt;              // Salt for CREATE2/CREATE3 deployment
    }
}

