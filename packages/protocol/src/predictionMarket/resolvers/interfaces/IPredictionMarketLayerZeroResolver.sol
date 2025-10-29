// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IPredictionMarketResolver} from "../IPredictionMarketResolver.sol";

/**
 * @title IPredictionMarketLayerZeroResolver
 * @notice Interface for LayerZero-based Prediction Market Resolver
 */
interface IPredictionMarketLayerZeroResolver is IPredictionMarketResolver {
    // Custom errors
    error OnlyApprovedAssertersCanCall();
    error OnlyRemoteResolverCanCall();
    error MarketNotEnded();
    error MarketAlreadySettled();
    error InvalidMarketId();
    error AssertionAlreadySubmitted();
    error NotEnoughBondAmount(
        address sender,
        address bondCurrency,
        uint256 bondAmount,
        uint256 initialBalance,
        uint256 finalBalance
    );

    // Events
    event MarketWrapped(
        address wrapper,
        bytes32 marketId,
        bytes claim,
        uint256 endTime,
        uint256 wrapTime
    );
    event AssertionSubmitted(
        address asserter,
        bytes32 marketId,
        bytes32 assertionId,
        bool resolvedToYes,
        uint256 submissionTime
    );
    event AssertionDisputed(
        bytes32 marketId,
        bytes32 assertionId,
        uint256 disputeTime
    );
    event AssertionResolved(
        bytes32 marketId,
        bytes32 assertionId,
        bool resolvedToYes,
        bool assertedTruthfully,
        uint256 resolutionTime
    );

    // Functions
    function submitAssertion(
        bytes calldata claim,
        uint256 endTime,
        bool resolvedToYes
    ) external;

    function assertionResolvedCallback(
        bytes32 marketId,
        bytes32 assertionId,
        bool resolvedToYes,
        bool assertedTruthfully
    ) external;

    function assertionDisputedCallback(bytes32 marketId, bytes32 assertionId) external;
}
