// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ILayerZeroBridge} from "../../../bridge/interfaces/ILayerZeroBridge.sol";

/**
 * @title IPredictionMarketUmaSimpleResolver
 * @notice Interface for UMA-side Simple LayerZero Prediction Market Resolver
 * @dev This resolver handles UMA interactions and sends results to prediction market side
 */
interface IPredictionMarketUmaSimpleResolver is ILayerZeroBridge {
    // Custom errors
    error OnlyOptimisticOracleV3CanCall();
    error InvalidAssertionId();
    error MarketNotEnded();
    error MarketAlreadySettled();
    error AssertionAlreadySubmitted();
    error NotEnoughBondAmount(
        address sender,
        address bondCurrency,
        uint256 bondAmount,
        uint256 initialBalance,
        uint256 finalBalance
    );

    // Events
    event MarketSubmittedToUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId,
        address asserter,
        bytes claim,
        bool resolvedToYes
    );
    event MarketResolvedFromUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId,
        bool resolvedToYes,
        bool assertedTruthfully
    );
    event MarketDisputedFromUMA(
        bytes32 indexed marketId,
        bytes32 indexed assertionId
    );

    // Functions
    function submitAssertion(
        bytes calldata claim,
        uint256 endTime,
        bool resolvedToYes
    ) external;

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external;

    function assertionDisputedCallback(bytes32 assertionId) external;

    // Optimistic Oracle V3
    function setOptimisticOracleV3(address _optimisticOracleV3) external;
    function getOptimisticOracleV3() external view returns (address);

    // Bond Management
    function depositBond(address bondCurrency, uint256 amount) external;
    function withdrawBond(address bondCurrency, uint256 amount) external;
    function getBondBalance(address bondCurrency) external view returns (uint256);
}
