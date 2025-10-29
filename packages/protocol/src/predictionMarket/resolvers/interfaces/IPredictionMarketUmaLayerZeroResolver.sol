// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ILayerZeroBridge} from "../../../bridge/interfaces/ILayerZeroBridge.sol";

/**
 * @title IPredictionMarketUmaLayerZeroResolver
 * @notice Interface for UMA-side LayerZero Prediction Market Resolver
 */
interface IPredictionMarketUmaLayerZeroResolver is ILayerZeroBridge {
    // Custom errors
    error OnlyOptimisticOracleV3CanCall();
    error InvalidAssertionId();
    error InvalidMarketId();

    // Events
    event AssertionSubmittedToUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId,
        address asserter,
        bytes claim,
        bool resolvedToYes
    );
    event AssertionResolvedFromUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId,
        bool resolvedToYes,
        bool assertedTruthfully
    );
    event AssertionDisputedFromUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId
    );

    // Functions
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external;

    function assertionDisputedCallback(bytes32 assertionId) external;

    // Optimistic Oracle V3
    function setOptimisticOracleV3(address _optimisticOracleV3) external;
    function getOptimisticOracleV3() external view returns (address);
}
