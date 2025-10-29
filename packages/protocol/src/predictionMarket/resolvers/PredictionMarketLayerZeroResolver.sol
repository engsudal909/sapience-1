// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPredictionMarketLayerZeroResolver} from "./interfaces/IPredictionMarketLayerZeroResolver.sol";
import {Encoder} from "../../bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ETHManagement} from "../../bridge/abstract/ETHManagement.sol";

/**
 * @title PredictionMarketLayerZeroResolver
 * @notice LayerZero-based resolver contract for Prediction Market system
 * @dev This contract runs on the prediction market network and communicates with UMA via LayerZero
 */
contract PredictionMarketLayerZeroResolver is
    OApp,
    IPredictionMarketLayerZeroResolver,
    ReentrancyGuard,
    ETHManagement
{
    using SafeERC20 for IERC20;
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;
    using OptionsBuilder for bytes;

    // ============ Settings ============
    struct Settings {
        uint256 maxPredictionMarkets;
        address bondCurrency;
        uint256 bondAmount;
        uint64 assertionLiveness;
        address remoteResolver; // Address of the UMA-side resolver
    }

    Settings public config;
    BridgeTypes.BridgeConfig private bridgeConfig;

    mapping(address => bool) public approvedAsserters;

    // ============ UMA Market Resolver Structs ============
    struct WrappedMarket {
        // Identification
        bytes32 marketId;
        // State
        bool assertionSubmitted;
        bool settled;
        bool resolvedToYes;
        // UMA
        bytes32 assertionId;
    }

    struct PredictedOutcome {
        bytes32 marketId;
        bool prediction; // true for YES, false for NO
    }

    mapping(bytes32 => WrappedMarket) public wrappedMarkets;

    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config,
        address[] memory _approvedAsserters
    ) OApp(_endpoint, _owner) ETHManagement(_owner) {
        config = _config;
        for (uint256 i = 0; i < _approvedAsserters.length; i++) {
            approvedAsserters[_approvedAsserters[i]] = true;
        }
    }

    // ============ Configuration Functions ============
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external onlyOwner {
        bridgeConfig = _bridgeConfig;
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    function setConfig(Settings calldata _config) external onlyOwner {
        config = _config;
    }

    function addApprovedAsserter(address asserter) external onlyOwner {
        approvedAsserters[asserter] = true;
    }

    function removeApprovedAsserter(address asserter) external onlyOwner {
        approvedAsserters[asserter] = false;
    }

    // ============ Resolver Functions ============
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );

        if (predictedOutcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (predictedOutcomes.length > config.maxPredictionMarkets)
            revert TooManyMarkets();

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 currentMarketId = predictedOutcomes[i].marketId;
            if (currentMarketId == bytes32(0)) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }
        }
        return (isValid, error);
    }

    function getPredictionResolution(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isResolved, Error error, bool parlaySuccess) {
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );
        parlaySuccess = true;
        isResolved = true;
        error = Error.NO_ERROR;
        bool hasUnsettledMarkets = false;

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 marketId = predictedOutcomes[i].marketId;
            if (marketId == bytes32(0)) {
                isResolved = false;
                error = Error.INVALID_MARKET;
                break;
            }
            WrappedMarket memory market = wrappedMarkets[marketId];

            if (market.marketId != marketId) {
                // This means it wasn't wrapped yet, so we don't know if it's settled or not.
                hasUnsettledMarkets = true;
                continue;
            }

            if (!market.settled) {
                hasUnsettledMarkets = true;
                continue;
            }

            bool marketOutcome = market.resolvedToYes;

            if (predictedOutcomes[i].prediction != marketOutcome) {
                parlaySuccess = false;
                return (true, Error.NO_ERROR, parlaySuccess);
            }
        }

        if (isResolved && hasUnsettledMarkets) {
            isResolved = false;
            error = Error.MARKET_NOT_SETTLED;
        }

        return (isResolved, error, parlaySuccess);
    }

    // ============ Prediction Outcomes Encoding and Decoding Functions ============
    function encodePredictionOutcomes(
        PredictedOutcome[] calldata predictedOutcomes
    ) external pure returns (bytes memory) {
        return abi.encode(predictedOutcomes);
    }

    function decodePredictionOutcomes(
        bytes calldata encodedPredictedOutcomes
    ) public pure returns (PredictedOutcome[] memory) {
        return abi.decode(encodedPredictedOutcomes, (PredictedOutcome[]));
    }

    // ============ UMA Market Validation Functions ============
    function submitAssertion(
        bytes calldata claim,
        uint256 endTime,
        bool resolvedToYes
    ) external nonReentrant {
        if (!approvedAsserters[msg.sender]) {
            revert OnlyApprovedAssertersCanCall();
        }

        if (block.timestamp < endTime) {
            revert MarketNotEnded();
        }

        bytes32 marketId = keccak256(abi.encodePacked(claim, ":", endTime));

        if (wrappedMarkets[marketId].marketId == bytes32(0)) {
            // Market not wrapped yet. Wrap it.
            wrappedMarkets[marketId] = WrappedMarket({
                marketId: marketId,
                assertionSubmitted: false,
                settled: false,
                resolvedToYes: false,
                assertionId: bytes32(0)
            });
            emit MarketWrapped(
                msg.sender,
                marketId,
                claim,
                endTime,
                block.timestamp
            );
        }

        WrappedMarket storage market = wrappedMarkets[marketId];

        if (market.marketId != marketId) {
            revert InvalidMarketId();
        }

        if (market.assertionId != bytes32(0) || market.assertionSubmitted) {
            revert AssertionAlreadySubmitted();
        }

        if (market.settled) {
            revert MarketAlreadySettled();
        }

        IERC20 bondCurrency = IERC20(config.bondCurrency);

        // Get the bond currency (with protection against tokens with fees on transfer)
        uint256 initialBalance = bondCurrency.balanceOf(address(this));
        bondCurrency.safeTransferFrom(
            msg.sender,
            address(this),
            config.bondAmount
        );
        uint256 finalBalance = bondCurrency.balanceOf(address(this));
        if (initialBalance + config.bondAmount != finalBalance) {
            revert NotEnoughBondAmount(
                msg.sender,
                config.bondCurrency,
                config.bondAmount,
                initialBalance,
                finalBalance
            );
        }

        // Generate a unique assertion ID for tracking
        bytes32 assertionId = keccak256(abi.encodePacked(marketId, block.timestamp, msg.sender));

        // Update the wrapped market
        market.assertionId = assertionId;
        market.assertionSubmitted = true;

        // Send assertion to UMA side via LayerZero
        bytes memory commandPayload = Encoder.encodeToUMASubmitAssertion(
            marketId,
            claim,
            endTime,
            resolvedToYes,
            msg.sender,
            config.assertionLiveness,
            config.bondCurrency,
            config.bondAmount
        );

        _sendLayerZeroMessageWithQuote(Encoder.CMD_TO_UMA_SUBMIT_ASSERTION, commandPayload, false);

        emit AssertionSubmitted(
            msg.sender,
            marketId,
            assertionId,
            resolvedToYes,
            block.timestamp
        );
    }

    // ============ LayerZero Message Handling ============
    function _lzReceive(Origin calldata _origin, bytes32, bytes calldata _message, address, bytes calldata)
        internal
        override
    {
        if (_origin.srcEid != bridgeConfig.remoteEid) {
            revert InvalidSourceChain(bridgeConfig.remoteEid, _origin.srcEid);
        }
        if (address(uint160(uint256(_origin.sender))) != bridgeConfig.remoteBridge) {
            revert InvalidSender(bridgeConfig.remoteBridge, address(uint160(uint256(_origin.sender))));
        }

        // Handle incoming messages from the UMA side
        (uint16 commandType, bytes memory data) = _message.decodeType();

        if (commandType == Encoder.CMD_FROM_UMA_ASSERTION_RESOLVED) {
            (bytes32 marketId, bytes32 assertionId, bool resolvedToYes, bool assertedTruthfully) = 
                data.decodeFromUMAAssertionResolved();
            assertionResolvedCallback(marketId, assertionId, resolvedToYes, assertedTruthfully);
        } else if (commandType == Encoder.CMD_FROM_UMA_ASSERTION_DISPUTED) {
            (bytes32 marketId, bytes32 assertionId) = data.decodeFromUMAAssertionDisputed();
            assertionDisputedCallback(marketId, assertionId);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    // ============ UMA Callback Functions ============
    function assertionResolvedCallback(
        bytes32 marketId,
        bytes32 assertionId,
        bool resolvedToYes,
        bool assertedTruthfully
    ) public {
        if (msg.sender != address(this)) {
            revert OnlyRemoteResolverCanCall();
        }

        WrappedMarket storage market = wrappedMarkets[marketId];
        if (market.assertionId != assertionId) {
            revert InvalidAssertionId();
        }
        if (market.settled) {
            revert MarketAlreadySettled();
        }

        if (assertedTruthfully) {
            market.settled = true;
            market.resolvedToYes = resolvedToYes;
        } else {
            // If assertedTruthfully is false, the assertion was disputed and rejected.
            // The market remains unsettled, but we clear the assertion state to allow a new assertion.
        }

        // Clear the assertion state to enable re-submission of assertions after disputes
        market.assertionId = bytes32(0);
        market.assertionSubmitted = false;

        emit AssertionResolved(
            marketId,
            assertionId,
            market.resolvedToYes,
            assertedTruthfully,
            block.timestamp
        );
    }

    function assertionDisputedCallback(bytes32 marketId, bytes32 assertionId) public {
        if (msg.sender != address(this)) {
            revert OnlyRemoteResolverCanCall();
        }

        emit AssertionDisputed(marketId, assertionId, block.timestamp);
    }

    // ============ Helper Functions ============
    function _sendLayerZeroMessageWithQuote(uint16 commandCode, bytes memory commandPayload, bool onlyQuote)
        internal
        returns (MessagingReceipt memory receipt, MessagingFee memory fee)
    {
        bytes memory message = abi.encode(commandCode, commandPayload);

        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(_getLzReceiveCost(), 0);

        // Get quote for the message
        fee = _quote(
            bridgeConfig.remoteEid,
            message,
            options,
            false // payInLzToken
        );

        if (onlyQuote) {
            return (MessagingReceipt(0, 0, fee), fee);
        }

        // Check if contract has enough ETH
        _requireSufficientETH(fee.nativeFee);

        // Send the message using the external send function with ETH from contract
        receipt = this._sendMessageWithETH{value: fee.nativeFee}(bridgeConfig.remoteEid, message, options, fee);

        return (receipt, fee);
    }

    // External function to send LayerZero messages with ETH from contract balance
    function _sendMessageWithETH(uint32 _dstEid, bytes memory _message, bytes memory _options, MessagingFee memory _fee)
        external
        payable
        returns (MessagingReceipt memory)
    {
        if (msg.sender != address(this)) {
            revert OnlySelfCallAllowed(msg.sender);
        }
        return _lzSend(_dstEid, _message, _options, _fee, payable(address(this)));
    }
}
