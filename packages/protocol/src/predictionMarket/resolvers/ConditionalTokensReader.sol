// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OAppSender, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import {OAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Encoder} from "../../bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/// @notice Minimal subset of Gnosis ConditionalTokens we need for resolution
interface IConditionalTokens {
    function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256);
    function payoutDenominator(bytes32 conditionId) external view returns (uint256);
    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);
}

/**
 * @title ConditionalTokensReader
 * @notice Contract that reads ConditionalTokens and sends resolution data via LayerZero
 * @dev This contract receives conditionId requests, reads ConditionalTokens data, and sends
 *      the resolution (payoutDenominator, noPayout, yesPayout) back to the resolver contract.
 */
contract ConditionalTokensReader is
    OAppSender,
    ReentrancyGuard
{
    using OptionsBuilder for bytes;
    using Encoder for bytes;
    using BridgeTypes for BridgeTypes.BridgeConfig;

    // ============ Custom Errors ============
    error InvalidConditionId();
    error InsufficientETHForFee(uint256 required, uint256 available);
    error InsufficientBalance(uint256 required, uint256 available);
    error ConditionIsNotBinary(bytes32 conditionId);
    error ConditionNotResolved(bytes32 conditionId);
    error InvalidPayout(bytes32 conditionId);

    // ============ Settings ============
    struct Settings {
        address conditionalTokens;  // Address of ConditionalTokens contract on Polygon
    }

    Settings public config;
    BridgeTypes.BridgeConfig private bridgeConfig;

    // ============ Events ============
    event ResolutionRequested(
        bytes32 indexed conditionId,
        bytes32 guid,
        uint256 timestamp
    );

    event ResolutionSent(
        bytes32 indexed conditionId,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        bytes32 guid,
        uint256 timestamp
    );

    event ConfigUpdated(address conditionalTokens);
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig bridgeConfig);

    // ============ Constructor ============
    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) OAppCore(_endpoint, _owner) Ownable(_owner) {
        config = _config;
    }

    // ============ Configuration Functions ============
    function setConfig(Settings calldata _config) external onlyOwner {
        config = _config;
        emit ConfigUpdated(_config.conditionalTokens);
    }

    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _bridgeConfig) external onlyOwner {
        bridgeConfig = _bridgeConfig;
        emit BridgeConfigUpdated(_bridgeConfig);
    }

    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    // ============ Resolution Request ============
    
    /**
     * @notice Request resolution for a conditionId by reading ConditionalTokens and sending data back
     * @param conditionId The ConditionalTokens conditionId to query
     * @dev Reads payoutDenominator and payoutNumerators from ConditionalTokens and sends via lzSend
     */
    function requestResolution(bytes32 conditionId) external payable nonReentrant {
        if (conditionId == bytes32(0)) revert InvalidConditionId();
        
        // Read ConditionalTokens data
        uint256 slotCount = IConditionalTokens(config.conditionalTokens).getOutcomeSlotCount(conditionId);
        uint256 payoutDenominator = IConditionalTokens(config.conditionalTokens).payoutDenominator(conditionId);
        uint256 noPayout = IConditionalTokens(config.conditionalTokens).payoutNumerators(conditionId, 0);
        uint256 yesPayout = IConditionalTokens(config.conditionalTokens).payoutNumerators(conditionId, 1);

        // Validate condition and resolved state and revert fast if invalid 
        _validateConditionAndResolvedState(conditionId, slotCount, payoutDenominator, noPayout, yesPayout);
        
        // Encode resolution response
        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            conditionId,
            payoutDenominator,
            noPayout,
            yesPayout
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);
        
        // Build options - 200k gas should be enough for _lzReceive + _finalizeResolution
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0);
        
        // Quote fee
        MessagingFee memory fee = _quote(bridgeConfig.remoteEid, message, options, false);
        
        // Only use msg.value, not contract balance
        if (msg.value < fee.nativeFee) {
            revert InsufficientETHForFee(fee.nativeFee, msg.value);
        }
        
        // Send message
        MessagingReceipt memory receipt = _lzSend(
            bridgeConfig.remoteEid,
            message,
            options,
            fee,
            payable(msg.sender) // Refund excess to sender
        );
        
        // Refund excess ETH if any
        if (msg.value > fee.nativeFee) {
            uint256 excess = msg.value - fee.nativeFee;
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            require(success, "Refund failed");
        }
        
        emit ResolutionRequested(conditionId, receipt.guid, block.timestamp);
        emit ResolutionSent(conditionId, payoutDenominator, noPayout, yesPayout, receipt.guid, block.timestamp);
    }

    /**
     * @notice Quote the fee for a resolution request
     * @param conditionId The conditionId to query (used for message size estimation)
     * @return fee The MessagingFee required for the request
     */
    function quoteResolution(bytes32 conditionId) external view returns (MessagingFee memory fee) {
        // Encode resolution response (same as actual message)
        bytes memory commandPayload = Encoder.encodeFromConditionalTokenReaderResolutionResponse(
            conditionId,
            0, // Placeholder values for fee estimation
            0,
            0
        );
        bytes memory message = abi.encode(Encoder.CMD_FROM_CONDITIONAL_TOKEN_READER_RESOLUTION_RESPONSE, commandPayload);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0);
        return _quote(bridgeConfig.remoteEid, message, options, false);
    }

    // ============ ETH Management ============
    
    /**
     * @notice Withdraw ETH from the contract
     * @param amount Amount to withdraw
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Get current ETH balance
     */
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}

    // ============ Internal Functions ============

    function _validateConditionAndResolvedState(bytes32 conditionId, uint256 slotCount, uint256 payoutDenominator, uint256 noPayout, uint256 yesPayout) internal pure {
        if (slotCount != 2) revert ConditionIsNotBinary(conditionId);
        if (payoutDenominator == 0) revert ConditionNotResolved(conditionId);
        if (noPayout + yesPayout != payoutDenominator) revert InvalidPayout(conditionId);
        if (noPayout == yesPayout) revert InvalidPayout(conditionId);
    }
}


