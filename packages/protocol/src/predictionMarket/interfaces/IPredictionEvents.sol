// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IPredictionStructs.sol";

/**
 * @title IPredictionEvents
 * @notice Interface containing all prediction-related events
 */
interface IPredictionEvents {
    // ============ Events ============

    event PredictionMinted(
        address indexed requester,
        address indexed responder,
        bytes encodedPredictedOutcomes,
        uint256 requesterNftTokenId,
        uint256 responderNftTokenId,
        uint256 requesterCollateral, // locked in the pool from requester
        uint256 responderCollateral, // delta paid by responder to reach the payout amount
        uint256 totalCollateral, // total payout to the winner,
        bytes32 refCode
    );

    event PredictionBurned(
        address indexed requester,
        address indexed responder,
        bytes encodedPredictedOutcomes,
        uint256 requesterNftTokenId,
        uint256 responderNftTokenId,
        uint256 totalCollateral,
        bool requesterWon,
        bytes32 refCode
    );

    event PredictionConsolidated(
        uint256 indexed requesterNftTokenId,
        uint256 indexed responderNftTokenId,
        uint256 totalCollateral,
        bytes32 refCode
    );

    // ============ Limit Order Events ============
    event OrderPlaced(
        address indexed requester,
        uint256 indexed orderId,
        bytes encodedPredictedOutcomes,
        address resolver,
        uint256 requesterCollateral,
        uint256 responderCollateral,
        bytes32 refCode
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed requester,
        address indexed responder,
        bytes encodedPredictedOutcomes,
        uint256 requesterCollateral,
        uint256 responderCollateral,
        bytes32 refCode
    );

    event OrderCancelled(
        uint256 indexed orderId,
        address indexed requester,
        bytes encodedPredictedOutcomes,
        uint256 requesterCollateral,
        uint256 responderCollateral
    );
}
