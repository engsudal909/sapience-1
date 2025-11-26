// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IPredictionStructs
 * @notice Interface containing all prediction-related structs
 */
interface IPredictionStructs {
    // ============ Structs ============
    struct Settings {
        address collateralToken; // collateral token
        uint256 minCollateral; // minimum collateral amount for a prediction
    }

    struct PredictionData {
        // Prediction metadata
        uint256 predictionId;        // slot 0
        uint256 requesterNftTokenId;     // slot 1
        uint256 responderNftTokenId;     // slot 2
        uint256 requesterCollateral;     // slot 3
        uint256 responderCollateral;     // slot 4
        // Prediction data
        bytes encodedPredictedOutcomes; // slot 5 (dynamic)
        // Packed fields in slot 6
        address resolver;            // slot 6 (packed with addresses and bools)
        address requester;               // slot 6 (packed)
        address responder;               // slot 6 (packed)
        bool settled;                // slot 6 (packed)
        bool requesterWon;               // slot 6 (packed)
    }

    // Struct to mint prediction data
    struct MintPredictionRequestData {
        bytes encodedPredictedOutcomes; // encoded predicted outcomes for the resolver to validate
        address resolver;
        uint256 requesterCollateral;
        uint256 responderCollateral;
        address requester;
        address responder;
        uint256 requesterNonce; // nonce to prevent signature replay per requester
        bytes responderSignature; // Responder is allowing just this prediction
        uint256 responderDeadline; // deadline for the responder signature
        bytes32 refCode;
    }

    // Struct to mint prediction data
    struct OrderRequestData {
        bytes encodedPredictedOutcomes; // encoded predicted outcomes for the resolver to validate
        uint256 orderDeadline;
        address resolver;
        uint256 requesterCollateral;
        uint256 responderCollateral;
        bytes32 refCode;
    }

    // Struct to mint prediction data
    struct LimitOrderData {
        uint256 orderId;             // slot 0
        uint256 requesterCollateral;     // slot 1
        uint256 responderCollateral;     // slot 2
        uint256 orderDeadline;       // slot 3
        bytes encodedPredictedOutcomes; // slot 4 (dynamic)
        address resolver;            // slot 5 (packed with addresses)
        address requester;               // slot 5 (packed)
        address responder;               // slot 5 (packed)
    }
}
