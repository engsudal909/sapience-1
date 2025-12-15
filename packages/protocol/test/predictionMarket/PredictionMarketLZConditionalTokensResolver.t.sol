// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IPredictionMarketResolver} from "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";

import "forge-std/Test.sol";

/**
 * @title PredictionMarketLZConditionalTokensResolverTestWrapper
 * @notice Wrapper to expose internal functions for testing
 */
contract PredictionMarketLZConditionalTokensResolverTestWrapper is PredictionMarketLZConditionalTokensResolver {
    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) PredictionMarketLZConditionalTokensResolver(_endpoint, _owner, _config) {}

    /// @notice Exposed lzReceive for testing callback decoding
    function exposed_lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external {
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }

    /// @notice Exposed processResolution for direct unit testing
    function exposed_processResolution(
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) external {
        _processResolution(conditionId, denom, noPayout, yesPayout);
    }

    /// @notice Exposed buildReadCommand for inspection
    function exposed_buildReadCommand(bytes32 conditionId) external view returns (bytes memory) {
        return _buildReadCommand(conditionId);
    }

    /// @notice Clear pending request for test setup
    function clearPendingRequest(bytes32 conditionId) external {
        pendingRequests[conditionId] = false;
    }

    /// @notice Set pending request for test setup
    function setPendingRequest(bytes32 conditionId) external {
        pendingRequests[conditionId] = true;
    }
}

/**
 * @title PredictionMarketLZConditionalTokensResolverTest
 * @notice Test suite for PredictionMarketLZConditionalTokensResolver
 */
contract PredictionMarketLZConditionalTokensResolverTest is TestHelperOz5 {
    // Users
    address private owner = address(this);
    address private unauthorizedUser = address(0x1);

    // Contracts
    PredictionMarketLZConditionalTokensResolverTestWrapper private resolver;

    // LZ data
    uint32 private localEid = 1;
    uint32 private remoteEid = 2;

    address localEndpoint;

    // Test data
    uint256 public constant MAX_PREDICTION_MARKETS = 10;
    uint16 public constant CONFIRMATIONS = 15;
    uint128 public constant LZ_RECEIVE_GAS = 200_000;
    address public constant CONDITIONAL_TOKENS = address(0xC0D1710A15);
    
    bytes32 public constant TEST_CONDITION_ID = keccak256("test-condition");
    bytes32 public constant TEST_CONDITION_ID_2 = keccak256("test-condition-2");
    bytes32 public constant TEST_CONDITION_ID_3 = keccak256("test-condition-3");

    function setUp() public override {
        vm.deal(owner, 100 ether);
        vm.deal(unauthorizedUser, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy resolver
        resolver = PredictionMarketLZConditionalTokensResolverTestWrapper(
            payable(
                _deployOApp(
                    type(PredictionMarketLZConditionalTokensResolverTestWrapper).creationCode,
                    abi.encode(
                        address(endpoints[localEid]),
                        owner,
                        PredictionMarketLZConditionalTokensResolver.Settings({
                            maxPredictionMarkets: MAX_PREDICTION_MARKETS,
                            remoteEid: remoteEid,
                            conditionalTokens: CONDITIONAL_TOKENS,
                            confirmations: CONFIRMATIONS,
                            lzReceiveGasLimit: LZ_RECEIVE_GAS
                        })
                    )
                )
            )
        );

        localEndpoint = address(resolver.endpoint());

        // Enable the read channel for remote chain
        resolver.setReadChannel(remoteEid, true);

        vm.deal(address(resolver), 100 ether);
    }

    // ============ Constructor Tests ============

    function test_constructor_validParameters() public view {
        assertEq(address(resolver.owner()), owner, "Owner should be set");
        
        (
            uint256 maxPredictionMarkets,
            uint32 configRemoteEid,
            address conditionalTokens,
            uint16 confirmations,
            uint128 lzReceiveGasLimit
        ) = resolver.config();
        
        assertEq(maxPredictionMarkets, MAX_PREDICTION_MARKETS, "Max markets should be set");
        assertEq(configRemoteEid, remoteEid, "Remote EID should be set");
        assertEq(conditionalTokens, CONDITIONAL_TOKENS, "ConditionalTokens should be set");
        assertEq(confirmations, CONFIRMATIONS, "Confirmations should be set");
        assertEq(lzReceiveGasLimit, LZ_RECEIVE_GAS, "LZ receive gas should be set");
    }

    // ============ Configuration Tests ============

    function test_setConfig() public {
        PredictionMarketLZConditionalTokensResolver.Settings memory newConfig =
            PredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 20,
                remoteEid: 999,
                conditionalTokens: address(0x1234),
                confirmations: 30,
                lzReceiveGasLimit: 300_000
            });

        resolver.setConfig(newConfig);

        (
            uint256 maxPredictionMarkets,
            uint32 configRemoteEid,
            address conditionalTokens,
            uint16 confirmations,
            uint128 lzReceiveGasLimit
        ) = resolver.config();

        assertEq(maxPredictionMarkets, 20, "Max markets should be updated");
        assertEq(configRemoteEid, 999, "Remote EID should be updated");
        assertEq(conditionalTokens, address(0x1234), "ConditionalTokens should be updated");
        assertEq(confirmations, 30, "Confirmations should be updated");
        assertEq(lzReceiveGasLimit, 300_000, "LZ receive gas should be updated");
    }

    function test_setConfig_onlyOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        resolver.setConfig(
            PredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: 20,
                remoteEid: 999,
                conditionalTokens: address(0x1234),
                confirmations: 30,
                lzReceiveGasLimit: 300_000
            })
        );
    }

    // ============ Validation Tests ============

    function test_validatePredictionMarkets_success() public view {
        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);

        assertTrue(isValid, "Should be valid");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
    }

    function test_validatePredictionMarkets_noMarkets() public {
        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](0);
        bytes memory encodedOutcomes = abi.encode(outcomes);

        vm.expectRevert(PredictionMarketLZConditionalTokensResolver.MustHaveAtLeastOneMarket.selector);
        resolver.validatePredictionMarkets(encodedOutcomes);
    }

    function test_validatePredictionMarkets_tooManyMarkets() public {
        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](MAX_PREDICTION_MARKETS + 1);
        for (uint256 i = 0; i < MAX_PREDICTION_MARKETS + 1; i++) {
            outcomes[i] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
                marketId: keccak256(abi.encodePacked("condition", i)),
                prediction: true
            });
        }

        bytes memory encodedOutcomes = abi.encode(outcomes);

        vm.expectRevert(PredictionMarketLZConditionalTokensResolver.TooManyMarkets.selector);
        resolver.validatePredictionMarkets(encodedOutcomes);
    }

    function test_validatePredictionMarkets_invalidConditionId() public view {
        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: bytes32(0),
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);

        assertFalse(isValid, "Should be invalid");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.INVALID_MARKET), "Should have invalid market error");
    }

    // ============ Resolution Processing Tests (Binary Payout Logic) ============

    function test_processResolution_yesOutcome() public {
        // denom=1, no=0, yes=1 => YES wins
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);

        PredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertTrue(condition.resolvedToYes, "Should resolve to YES");
        assertEq(condition.payoutDenominator, 1, "Denom should be 1");
        assertEq(condition.noPayout, 0, "No payout should be 0");
        assertEq(condition.yesPayout, 1, "Yes payout should be 1");
    }

    function test_processResolution_noOutcome() public {
        // denom=1, no=1, yes=0 => NO wins
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 1, 0);

        PredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertFalse(condition.resolvedToYes, "Should resolve to NO");
        assertEq(condition.payoutDenominator, 1, "Denom should be 1");
        assertEq(condition.noPayout, 1, "No payout should be 1");
        assertEq(condition.yesPayout, 0, "Yes payout should be 0");
    }

    function test_processResolution_yesWithLargerDenom() public {
        // denom=100, no=0, yes=100 => YES wins
        resolver.exposed_processResolution(TEST_CONDITION_ID, 100, 0, 100);

        PredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertTrue(condition.resolvedToYes, "Should resolve to YES");
    }

    function test_processResolution_noWithLargerDenom() public {
        // denom=100, no=100, yes=0 => NO wins
        resolver.exposed_processResolution(TEST_CONDITION_ID, 100, 100, 0);

        PredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertTrue(condition.settled, "Should be settled");
        assertFalse(condition.resolvedToYes, "Should resolve to NO");
    }

    function test_processResolution_unresolved() public {
        // denom=0 means unresolved
        resolver.exposed_processResolution(TEST_CONDITION_ID, 0, 0, 0);

        PredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertFalse(condition.settled, "Should not be settled");
        assertEq(condition.payoutDenominator, 0, "Denom should be 0");
    }

    function test_processResolution_revertOnNonBinary_split() public {
        // denom=2, no=1, yes=1 => Split payout (ambiguous) => revert
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketLZConditionalTokensResolver.ConditionNotBinary.selector,
                TEST_CONDITION_ID,
                2,
                1,
                1
            )
        );
        resolver.exposed_processResolution(TEST_CONDITION_ID, 2, 1, 1);
    }

    function test_processResolution_revertOnNonBinary_invalidSum() public {
        // denom=100, no=50, yes=30 => Sum != denom => revert
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketLZConditionalTokensResolver.ConditionNotBinary.selector,
                TEST_CONDITION_ID,
                100,
                50,
                30
            )
        );
        resolver.exposed_processResolution(TEST_CONDITION_ID, 100, 50, 30);
    }

    // ============ Resolution Query Tests ============

    function test_getPredictionResolution_notQueried() public view {
        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertFalse(isResolved, "Should not be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED), "Should have MARKET_NOT_SETTLED error");
        assertTrue(parlaySuccess, "Parlay success should default to true");
    }

    function test_getPredictionResolution_settledCorrect() public {
        // Settle condition to YES
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);

        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true // Correct prediction
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertTrue(parlaySuccess, "Parlay should succeed");
    }

    function test_getPredictionResolution_settledIncorrect() public {
        // Settle condition to YES
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);

        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: false // Wrong prediction
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertFalse(parlaySuccess, "Parlay should fail");
    }

    function test_getPredictionResolution_multipleConditions_allCorrect() public {
        // Settle all conditions
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);     // YES
        resolver.exposed_processResolution(TEST_CONDITION_ID_2, 1, 1, 0);   // NO
        resolver.exposed_processResolution(TEST_CONDITION_ID_3, 1, 0, 1);   // YES

        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](3);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID, prediction: true
        });
        outcomes[1] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2, prediction: false
        });
        outcomes[2] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_3, prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        assertTrue(isResolved, "Should be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertTrue(parlaySuccess, "Parlay should succeed - all correct");
    }

    function test_getPredictionResolution_decisiveLoss() public {
        // Settle first condition to YES
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);
        // Second condition not settled

        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID, prediction: false // Wrong
        });
        outcomes[1] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2, prediction: true
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        // Should return decisive loss even though second condition is unsettled
        assertTrue(isResolved, "Should be resolved due to decisive loss");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");
        assertFalse(parlaySuccess, "Parlay should fail - wrong prediction");
    }

    function test_getPredictionResolution_partiallySettled() public {
        // Only settle first condition
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1); // YES

        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID, prediction: true // Correct
        });
        outcomes[1] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2, prediction: true // Not settled
        });

        bytes memory encodedOutcomes = abi.encode(outcomes);

        (bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) =
            resolver.getPredictionResolution(encodedOutcomes);

        // No decisive loss but not all settled
        assertFalse(isResolved, "Should not be resolved");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED), "Should have MARKET_NOT_SETTLED error");
        assertTrue(parlaySuccess, "Parlay success should be true (no losses yet)");
    }

    // ============ Encoding/Decoding Tests ============

    function test_encodePredictionOutcomes() public view {
        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomes =
            new PredictionMarketLZConditionalTokensResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID,
            prediction: true
        });
        outcomes[1] = PredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: TEST_CONDITION_ID_2,
            prediction: false
        });

        bytes memory encoded = resolver.encodePredictionOutcomes(outcomes);

        // Decode and verify
        PredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory decoded =
            resolver.decodePredictionOutcomes(encoded);

        assertEq(decoded.length, 2, "Length should match");
        assertEq(decoded[0].marketId, TEST_CONDITION_ID, "Condition ID 1 should match");
        assertTrue(decoded[0].prediction, "Prediction 1 should be true");
        assertEq(decoded[1].marketId, TEST_CONDITION_ID_2, "Condition ID 2 should match");
        assertFalse(decoded[1].prediction, "Prediction 2 should be false");
    }

    // ============ View Functions Tests ============

    function test_getCondition() public view {
        PredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolver.getCondition(TEST_CONDITION_ID);

        assertEq(condition.conditionId, bytes32(0), "Condition should not exist initially");
        assertFalse(condition.settled, "Condition should not be settled");
        assertFalse(condition.resolvedToYes, "Condition should not be resolved");
    }

    function test_isConditionSettled() public view {
        bool settled = resolver.isConditionSettled(TEST_CONDITION_ID);
        assertFalse(settled, "Condition should not be settled initially");
    }

    function test_isConditionSettled_afterSettlement() public {
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);
        
        bool settled = resolver.isConditionSettled(TEST_CONDITION_ID);
        assertTrue(settled, "Condition should be settled");
    }

    function test_getConditionResolution() public {
        // First settle the condition
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);

        bool resolvedToYes = resolver.getConditionResolution(TEST_CONDITION_ID);
        assertTrue(resolvedToYes, "Condition should be resolved to YES");
    }

    function test_getConditionResolution_revertIfNotSettled() public {
        vm.expectRevert("Condition not settled");
        resolver.getConditionResolution(TEST_CONDITION_ID);
    }

    function test_isPendingRequest() public {
        assertFalse(resolver.isPendingRequest(TEST_CONDITION_ID), "Should not be pending initially");
        
        resolver.setPendingRequest(TEST_CONDITION_ID);
        assertTrue(resolver.isPendingRequest(TEST_CONDITION_ID), "Should be pending after setting");
        
        resolver.clearPendingRequest(TEST_CONDITION_ID);
        assertFalse(resolver.isPendingRequest(TEST_CONDITION_ID), "Should not be pending after clearing");
    }

    // ============ Request Resolution Tests ============

    function test_requestResolution_revertOnZeroConditionId() public {
        vm.expectRevert(PredictionMarketLZConditionalTokensResolver.InvalidConditionId.selector);
        resolver.requestResolution{value: 1 ether}(bytes32(0), bytes32(0));
    }

    function test_requestResolution_revertOnAlreadySettled() public {
        // Settle the condition
        resolver.exposed_processResolution(TEST_CONDITION_ID, 1, 0, 1);

        vm.expectRevert(PredictionMarketLZConditionalTokensResolver.ConditionAlreadySettled.selector);
        resolver.requestResolution{value: 1 ether}(TEST_CONDITION_ID, bytes32(0));
    }

    function test_requestResolution_revertOnPendingRequest() public {
        resolver.setPendingRequest(TEST_CONDITION_ID);

        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketLZConditionalTokensResolver.RequestAlreadyPending.selector,
                TEST_CONDITION_ID
            )
        );
        resolver.requestResolution{value: 1 ether}(TEST_CONDITION_ID, bytes32(0));
    }

    // ============ ETH Management Tests ============

    function test_depositETH() public {
        uint256 initialBalance = address(resolver).balance;
        
        (bool success, ) = address(resolver).call{value: 1 ether}("");
        assertTrue(success, "ETH deposit should succeed");
        
        assertEq(address(resolver).balance, initialBalance + 1 ether, "Balance should increase");
    }

    function test_withdrawETH() public {
        uint256 ownerInitialBalance = owner.balance;
        
        resolver.withdrawETH(1 ether);
        
        assertEq(owner.balance, ownerInitialBalance + 1 ether, "Owner should receive ETH");
    }

    function test_withdrawETH_onlyOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        resolver.withdrawETH(1 ether);
    }

    function test_getETHBalance() public view {
        uint256 balance = resolver.getETHBalance();
        assertEq(balance, 100 ether, "Should return correct balance");
    }

    // ============ Read Command Building Tests ============

    function test_buildReadCommand() public view {
        bytes memory cmd = resolver.exposed_buildReadCommand(TEST_CONDITION_ID);
        
        // Just verify it doesn't revert and returns non-empty bytes
        assertTrue(cmd.length > 0, "Command should not be empty");
    }
}

