// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OAppRead} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppRead.sol";
import {Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ReadCodecV1, EVMCallRequestV1, EVMCallComputeV1} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/ReadCodecV1.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPredictionMarketResolver} from "../interfaces/IPredictionMarketResolver.sol";

/// @notice Minimal subset of Gnosis ConditionalTokens we need for resolution
interface IConditionalTokens {
    function payoutDenominator(bytes32 conditionId) external view returns (uint256);
    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);
}

/**
 * @title PredictionMarketLZConditionalTokensResolver
 * @notice Resolver that uses LayerZero lzRead to query Gnosis ConditionalTokens payout data cross-chain
 * @dev Implements IPredictionMarketResolver and caches binary YES/NO outcomes for conditionIds.
 *      Uses lzRead to fetch payoutDenominator and payoutNumerators from a remote ConditionalTokens contract.
 */
contract PredictionMarketLZConditionalTokensResolver is
    OAppRead,
    IPredictionMarketResolver,
    ReentrancyGuard
{
    using OptionsBuilder for bytes;

    // ============ Custom Errors ============
    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error InvalidConditionId();
    error ConditionAlreadySettled();
    error ConditionNotBinary(bytes32 conditionId, uint256 denom, uint256 noPayout, uint256 yesPayout);
    error RequestAlreadyPending(bytes32 conditionId);
    error InvalidReadResponse();
    error InsufficientETHForFee(uint256 required, uint256 available);

    // ============ Constants ============
    /// @dev App command label for lzRead requests
    uint16 private constant APP_CMD_LABEL = 1;
    
    /// @dev Request labels for the three view calls
    uint16 private constant REQ_LABEL_DENOM = 1;
    uint16 private constant REQ_LABEL_NO_PAYOUT = 2;
    uint16 private constant REQ_LABEL_YES_PAYOUT = 3;

    // ============ Settings ============
    struct Settings {
        uint256 maxPredictionMarkets;
        uint32 remoteEid;              // LayerZero endpoint ID of the chain with ConditionalTokens
        address conditionalTokens;      // Address of ConditionalTokens contract on remote chain
        uint16 confirmations;           // Block confirmations required for lzRead
        uint128 lzReceiveGasLimit;      // Gas limit for lzReceive callback
    }

    Settings public config;

    // ============ Condition State ============
    struct ConditionState {
        bytes32 conditionId;
        bool settled;
        bool resolvedToYes;
        uint256 payoutDenominator;
        uint256 noPayout;
        uint256 yesPayout;
        uint64 updatedAt;
    }

    /// @dev Predicted outcome struct matching existing resolver pattern
    struct PredictedOutcome {
        bytes32 marketId;   // == conditionId for this resolver
        bool prediction;    // true for YES, false for NO
    }

    /// @dev Mapping from conditionId to its cached state
    mapping(bytes32 => ConditionState) public conditions;
    
    /// @dev Track pending resolution requests to prevent duplicates
    mapping(bytes32 => bool) public pendingRequests;

    // ============ Events ============
    event ResolutionRequested(
        bytes32 indexed conditionId,
        bytes32 indexed refCode,
        uint256 timestamp
    );
    
    event ConditionResolved(
        bytes32 indexed conditionId,
        bool resolvedToYes,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        uint256 timestamp
    );
    
    event ConfigUpdated(
        uint32 remoteEid,
        address conditionalTokens,
        uint16 confirmations,
        uint128 lzReceiveGasLimit,
        uint256 maxPredictionMarkets
    );

    // ============ Constructor ============
    constructor(
        address _endpoint,
        address _owner,
        Settings memory _config
    ) OAppRead(_endpoint, _owner) Ownable(_owner) {
        config = _config;
    }

    // ============ Configuration Functions ============
    function setConfig(Settings calldata _config) external onlyOwner {
        config = _config;
        emit ConfigUpdated(
            _config.remoteEid,
            _config.conditionalTokens,
            _config.confirmations,
            _config.lzReceiveGasLimit,
            _config.maxPredictionMarkets
        );
    }

    // ============ IPredictionMarketResolver Implementation ============
    
    /**
     * @notice Validate prediction markets (conditionIds)
     * @param encodedPredictedOutcomes ABI-encoded PredictedOutcome[]
     * @return isValid True if all conditionIds are valid
     * @return error Error code if validation fails
     */
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;
        
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(encodedPredictedOutcomes);

        if (predictedOutcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (predictedOutcomes.length > config.maxPredictionMarkets) revert TooManyMarkets();

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 conditionId = predictedOutcomes[i].marketId;
            if (conditionId == bytes32(0)) {
                isValid = false;
                error = Error.INVALID_MARKET;
                break;
            }
        }
        return (isValid, error);
    }

    /**
     * @notice Get prediction resolution status
     * @param encodedPredictedOutcomes ABI-encoded PredictedOutcome[]
     * @return isResolved True if all conditions are resolved
     * @return error Error code if resolution check fails
     * @return parlaySuccess True if all predictions match their resolved outcomes
     */
    function getPredictionResolution(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isResolved, Error error, bool parlaySuccess) {
        PredictedOutcome[] memory predictedOutcomes = decodePredictionOutcomes(encodedPredictedOutcomes);
        
        parlaySuccess = true;
        isResolved = true;
        error = Error.NO_ERROR;
        bool hasUnsettledConditions = false;

        if (predictedOutcomes.length == 0) {
            isResolved = false;
            error = Error.MUST_HAVE_AT_LEAST_ONE_MARKET;
            return (isResolved, error, parlaySuccess);
        }
        if (predictedOutcomes.length > config.maxPredictionMarkets) {
            isResolved = false;
            error = Error.TOO_MANY_MARKETS;
            return (isResolved, error, parlaySuccess);
        }

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            bytes32 conditionId = predictedOutcomes[i].marketId;
            
            if (conditionId == bytes32(0)) {
                isResolved = false;
                error = Error.INVALID_MARKET;
                break;
            }
            
            ConditionState memory condition = conditions[conditionId];

            // Check if condition has been queried and cached
            if (condition.conditionId != conditionId) {
                // Not queried yet
                hasUnsettledConditions = true;
                continue;
            }

            if (!condition.settled) {
                // Queried but not settled on remote chain
                hasUnsettledConditions = true;
                continue;
            }

            // Condition is settled - check if prediction matches outcome
            bool conditionOutcome = condition.resolvedToYes;
            if (predictedOutcomes[i].prediction != conditionOutcome) {
                parlaySuccess = false;
                // Decisive loss on settled condition - return immediately
                return (true, Error.NO_ERROR, parlaySuccess);
            }
        }

        if (isResolved && hasUnsettledConditions) {
            isResolved = false;
            error = Error.MARKET_NOT_SETTLED;
        }

        return (isResolved, error, parlaySuccess);
    }

    // ============ Prediction Outcomes Encoding/Decoding ============
    
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

    // ============ lzRead Resolution Request ============
    
    /**
     * @notice Request resolution data for a condition via lzRead
     * @param conditionId The ConditionalTokens conditionId to query
     * @param refCode Reference code for tracking
     * @dev Sends an lzRead request to fetch payoutDenominator and payoutNumerators
     */
    function requestResolution(
        bytes32 conditionId,
        bytes32 refCode
    ) external payable nonReentrant {
        if (conditionId == bytes32(0)) revert InvalidConditionId();
        if (conditions[conditionId].settled) revert ConditionAlreadySettled();
        if (pendingRequests[conditionId]) revert RequestAlreadyPending(conditionId);
        
        // Mark request as pending
        pendingRequests[conditionId] = true;
        
        // Build the lzRead command with 3 view calls
        bytes memory cmd = _buildReadCommand(conditionId);
        
        // Build options for lzReceive gas
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(config.lzReceiveGasLimit, 0);
        
        // Quote the fee
        MessagingFee memory fee = _quote(config.remoteEid, cmd, options, false);
        
        if (msg.value < fee.nativeFee) {
            revert InsufficientETHForFee(fee.nativeFee, msg.value);
        }
        
        // Send the lzRead request
        _lzSend(config.remoteEid, cmd, options, fee, payable(msg.sender));
        
        emit ResolutionRequested(conditionId, refCode, block.timestamp);
    }

    /**
     * @notice Quote the fee for a resolution request
     * @param conditionId The conditionId to query
     * @return fee The MessagingFee required
     */
    function quoteResolution(bytes32 conditionId) external view returns (MessagingFee memory fee) {
        bytes memory cmd = _buildReadCommand(conditionId);
        bytes memory options = OptionsBuilder.newOptions()
            .addExecutorLzReceiveOption(config.lzReceiveGasLimit, 0);
        return _quote(config.remoteEid, cmd, options, false);
    }

    /**
     * @dev Build the lzRead command to query ConditionalTokens payout data
     * @param conditionId The condition to query
     * @return cmd The encoded lzRead command
     */
    function _buildReadCommand(bytes32 conditionId) internal view returns (bytes memory) {
        EVMCallRequestV1[] memory requests = new EVMCallRequestV1[](3);
        
        // Request 1: payoutDenominator(conditionId)
        requests[0] = EVMCallRequestV1({
            appRequestLabel: REQ_LABEL_DENOM,
            targetEid: config.remoteEid,
            isBlockNum: false,
            blockNumOrTimestamp: 0, // Latest
            confirmations: config.confirmations,
            to: config.conditionalTokens,
            callData: abi.encodeWithSelector(
                IConditionalTokens.payoutDenominator.selector,
                conditionId
            )
        });
        
        // Request 2: payoutNumerators(conditionId, 0) - NO payout
        requests[1] = EVMCallRequestV1({
            appRequestLabel: REQ_LABEL_NO_PAYOUT,
            targetEid: config.remoteEid,
            isBlockNum: false,
            blockNumOrTimestamp: 0,
            confirmations: config.confirmations,
            to: config.conditionalTokens,
            callData: abi.encodeWithSelector(
                IConditionalTokens.payoutNumerators.selector,
                conditionId,
                uint256(0)
            )
        });
        
        // Request 3: payoutNumerators(conditionId, 1) - YES payout
        requests[2] = EVMCallRequestV1({
            appRequestLabel: REQ_LABEL_YES_PAYOUT,
            targetEid: config.remoteEid,
            isBlockNum: false,
            blockNumOrTimestamp: 0,
            confirmations: config.confirmations,
            to: config.conditionalTokens,
            callData: abi.encodeWithSelector(
                IConditionalTokens.payoutNumerators.selector,
                conditionId,
                uint256(1)
            )
        });
        
        // No compute needed - we just want the raw responses
        EVMCallComputeV1 memory compute; // Empty compute (targetEid = 0 means no compute)
        
        return ReadCodecV1.encode(APP_CMD_LABEL, requests, compute);
    }

    // ============ LayerZero Receive Handler ============
    
    /**
     * @dev Handle lzRead response containing payout data
     * @param _message The response payload containing conditionId and payout data
     */
    function _lzReceive(
        Origin calldata, // _origin - unused but required by interface
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override {
        // Decode the response
        // The response format from lzRead contains the original command and the responses
        // For simplicity, we expect the response to be ABI-encoded:
        // (bytes32 conditionId, uint256 denom, uint256 noPayout, uint256 yesPayout)
        
        // Note: The actual lzRead response format depends on whether compute is used.
        // Without compute, responses come back as raw view call returns.
        // We need to decode based on our request structure.
        
        (bytes32 conditionId, uint256 denom, uint256 noPayout, uint256 yesPayout) = 
            _decodeReadResponse(_message);
        
        // Clear pending status
        pendingRequests[conditionId] = false;
        
        // Process the resolution
        _processResolution(conditionId, denom, noPayout, yesPayout);
    }

    /**
     * @dev Decode the lzRead response
     * @param _message The raw response message
     * @return conditionId The condition that was queried
     * @return denom The payoutDenominator value
     * @return noPayout The payoutNumerators[0] value (NO)
     * @return yesPayout The payoutNumerators[1] value (YES)
     */
    function _decodeReadResponse(
        bytes calldata _message
    ) internal pure returns (
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) {
        // The lzRead response without compute is an array of raw view call return data
        // We decode each response in order: denom, noPayout, yesPayout
        // The conditionId must be extracted from the original call data or stored separately
        
        // For this implementation, we expect the executor to package the response as:
        // abi.encode(conditionId, denom, noPayout, yesPayout)
        // This may require a compute step or custom handling depending on LZ infrastructure
        
        // Simple decode assuming aggregated response
        (conditionId, denom, noPayout, yesPayout) = abi.decode(
            _message,
            (bytes32, uint256, uint256, uint256)
        );
    }

    /**
     * @dev Process resolution data and update condition state
     * @param conditionId The condition being resolved
     * @param denom The payoutDenominator (0 = unresolved)
     * @param noPayout The NO payout numerator
     * @param yesPayout The YES payout numerator
     */
    function _processResolution(
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) internal {
        ConditionState storage condition = conditions[conditionId];
        
        // Initialize if first time
        if (condition.conditionId == bytes32(0)) {
            condition.conditionId = conditionId;
        }
        
        // Store raw values for transparency
        condition.payoutDenominator = denom;
        condition.noPayout = noPayout;
        condition.yesPayout = yesPayout;
        condition.updatedAt = uint64(block.timestamp);
        
        // Check if resolved (denom > 0)
        if (denom == 0) {
            // Not resolved yet on the remote chain
            condition.settled = false;
            emit ConditionResolved(conditionId, false, denom, noPayout, yesPayout, block.timestamp);
            return;
        }
        
        // Validate strict binary condition
        // For a strict binary: no + yes == denom AND no != yes
        if (noPayout + yesPayout != denom || noPayout == yesPayout) {
            // Not a strict binary outcome (could be split payout or ambiguous)
            // We don't settle - leave as invalid state
            revert ConditionNotBinary(conditionId, denom, noPayout, yesPayout);
        }
        
        // Determine outcome: YES if yesPayout > 0
        condition.settled = true;
        condition.resolvedToYes = yesPayout > 0;
        
        emit ConditionResolved(
            conditionId,
            condition.resolvedToYes,
            denom,
            noPayout,
            yesPayout,
            block.timestamp
        );
    }

    // ============ View Functions ============
    
    function getCondition(bytes32 conditionId) external view returns (ConditionState memory) {
        return conditions[conditionId];
    }

    function isConditionSettled(bytes32 conditionId) external view returns (bool) {
        return conditions[conditionId].settled;
    }

    function getConditionResolution(bytes32 conditionId) external view returns (bool resolvedToYes) {
        ConditionState memory condition = conditions[conditionId];
        require(condition.settled, "Condition not settled");
        return condition.resolvedToYes;
    }

    function isPendingRequest(bytes32 conditionId) external view returns (bool) {
        return pendingRequests[conditionId];
    }

    // ============ ETH Management ============
    
    /**
     * @notice Deposit ETH for paying lzRead fees
     */
    function depositETH() external payable {
        // Accept ETH
    }

    /**
     * @notice Withdraw ETH from the contract
     * @param amount Amount to withdraw
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Get current ETH balance
     */
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}

