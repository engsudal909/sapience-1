// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IPredictionMarketResolver} from "../IPredictionMarketResolver.sol";

/**
 * @title IPredictionMarketSimpleResolver
 * @notice Simplified interface for LayerZero-based Prediction Market Resolver
 * @dev This resolver only receives resolution messages from UMA side via LayerZero
 */
interface IPredictionMarketSimpleResolver is IPredictionMarketResolver {
    // Custom errors
    error OnlyRemoteResolverCanCall();
    error InvalidMarketId();

    // Events
    event MarketResolved(
        bytes32 indexed marketId,
        bool resolvedToYes,
        bool assertedTruthfully,
        uint256 resolutionTime
    );
    event MarketDisputed(
        bytes32 indexed marketId,
        uint256 disputeTime
    );

    // Functions
    function marketResolvedCallback(
        bytes32 marketId,
        bool resolvedToYes,
        bool assertedTruthfully
    ) external;

    function marketDisputedCallback(bytes32 marketId) external;
}
