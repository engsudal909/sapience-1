// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import {OptimisticOracleV3CallbackRecipientInterface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3CallbackRecipientInterface.sol";
import {IPredictionMarketUmaLayerZeroResolver} from "./interfaces/IPredictionMarketUmaLayerZeroResolver.sol";
import {Encoder} from "../../bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ETHManagement} from "../../bridge/abstract/ETHManagement.sol";

/**
 * @title PredictionMarketUmaLayerZeroResolver
 * @notice UMA-side LayerZero resolver contract for Prediction Market system
 * @dev This contract runs on the UMA network and handles UMA interactions
 */
contract PredictionMarketUmaLayerZeroResolver is
    OApp,
    IPredictionMarketUmaLayerZeroResolver,
    OptimisticOracleV3CallbackRecipientInterface,
    ReentrancyGuard,
    ETHManagement
{
    using SafeERC20 for IERC20;
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;
    using OptionsBuilder for bytes;

    // ============ State Variables ============
    BridgeTypes.BridgeConfig private bridgeConfig;
    address private optimisticOracleV3Address;

    // Mapping to track assertions from prediction markets
    mapping(bytes32 => bytes32) private marketIdToAssertionId; // marketId => UMA assertionId
    mapping(bytes32 => bytes32) private assertionIdToMarketId; // UMA assertionId => marketId
    mapping(bytes32 => bool) private marketResolvedToYes; // marketId => resolvedToYes
    mapping(bytes32 => address) private marketAsserter; // marketId => asserter

    // ============ Constructor ============
    constructor(
        address _endpoint,
        address _owner,
        address _optimisticOracleV3
    ) OApp(_endpoint, _owner) ETHManagement(_owner) {
        optimisticOracleV3Address = _optimisticOracleV3;
    }

    // ============ Configuration Functions ============
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external onlyOwner {
        bridgeConfig = _bridgeConfig;
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    function setOptimisticOracleV3(address _optimisticOracleV3) external onlyOwner {
        optimisticOracleV3Address = _optimisticOracleV3;
        emit OptimisticOracleV3Updated(_optimisticOracleV3);
    }

    function getOptimisticOracleV3() external view returns (address) {
        return optimisticOracleV3Address;
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

        // Handle incoming messages from the prediction market side
        (uint16 commandType, bytes memory data) = _message.decodeType();

        if (commandType == Encoder.CMD_TO_UMA_SUBMIT_ASSERTION) {
            _handleSubmitAssertion(data);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    // ============ UMA Interaction Functions ============
    function _handleSubmitAssertion(bytes memory data) internal {
        (
            bytes32 marketId,
            bytes memory claim,
            uint256 endTime,
            bool resolvedToYes,
            address asserter,
            uint64 liveness,
            address currency,
            uint256 bond
        ) = data.decodeToUMASubmitAssertion();

        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(optimisticOracleV3Address);
        IERC20 bondCurrency = IERC20(currency);

        // Check if we have enough bond tokens
        if (bondCurrency.balanceOf(address(this)) < bond) {
            revert NotEnoughBondAmount(asserter, currency, bond, bondCurrency.balanceOf(address(this)), bondCurrency.balanceOf(address(this)));
        }

        // Approve the bond currency to the Optimistic Oracle V3
        bondCurrency.forceApprove(address(optimisticOracleV3), bond);

        // Get the "false" claim if needed
        bytes memory finalClaim = resolvedToYes ? claim : abi.encodePacked("False: ", claim);

        // Submit the assertion to UMA
        bytes32 umaAssertionId = optimisticOracleV3.assertTruth(
            finalClaim,
            asserter,
            address(this),
            address(0),
            liveness,
            bondCurrency,
            bond,
            optimisticOracleV3.defaultIdentifier(),
            bytes32(0)
        );

        // Store the mapping between market and assertion
        marketIdToAssertionId[marketId] = umaAssertionId;
        assertionIdToMarketId[umaAssertionId] = marketId;
        marketResolvedToYes[marketId] = resolvedToYes;
        marketAsserter[marketId] = asserter;

        emit AssertionSubmittedToUMA(
            marketId,
            umaAssertionId,
            asserter,
            claim,
            resolvedToYes
        );
    }

    // ============ UMA Callback Functions ============
    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external nonReentrant {
        if (msg.sender != optimisticOracleV3Address) {
            revert OnlyOptimisticOracleV3CanCall();
        }

        bytes32 marketId = assertionIdToMarketId[assertionId];
        if (marketId == bytes32(0)) {
            revert InvalidAssertionId();
        }

        bool resolvedToYes = marketResolvedToYes[marketId];

        // Send resolution back to prediction market side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMAAssertionResolved(
            marketId,
            assertionId,
            resolvedToYes,
            assertedTruthfully
        );

        _sendLayerZeroMessageWithQuote(Encoder.CMD_FROM_UMA_ASSERTION_RESOLVED, commandPayload, false);

        emit AssertionResolvedFromUMA(
            marketId,
            assertionId,
            resolvedToYes,
            assertedTruthfully
        );

        // Clean up mappings
        delete marketIdToAssertionId[marketId];
        delete assertionIdToMarketId[assertionId];
        delete marketResolvedToYes[marketId];
        delete marketAsserter[marketId];
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        if (msg.sender != optimisticOracleV3Address) {
            revert OnlyOptimisticOracleV3CanCall();
        }

        bytes32 marketId = assertionIdToMarketId[assertionId];
        if (marketId == bytes32(0)) {
            revert InvalidAssertionId();
        }

        // Send dispute notification back to prediction market side via LayerZero
        bytes memory commandPayload = Encoder.encodeFromUMAAssertionDisputed(marketId, assertionId);

        _sendLayerZeroMessageWithQuote(Encoder.CMD_FROM_UMA_ASSERTION_DISPUTED, commandPayload, false);

        emit AssertionDisputedFromUMA(marketId, assertionId);
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

    // ============ View Functions ============
    function getMarketAssertionId(bytes32 marketId) external view returns (bytes32) {
        return marketIdToAssertionId[marketId];
    }

    function getAssertionMarketId(bytes32 assertionId) external view returns (bytes32) {
        return assertionIdToMarketId[assertionId];
    }
}
