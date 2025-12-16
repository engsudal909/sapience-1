// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OAppRead} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppRead.sol";
import {Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
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
 *      Sends 3 separate lzRead requests per condition and correlates responses via guid.
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
    error RequestAlreadyPending(bytes32 conditionId);
    error InsufficientETHForFee(uint256 required, uint256 available);
    error UnknownGuid(bytes32 guid);

    // ============ Enums ============
    /// @dev Response types for the 3 lzRead calls
    enum ResponseType {
        DENOM,      // payoutDenominator
        NO_PAYOUT,  // payoutNumerators[0]
        YES_PAYOUT  // payoutNumerators[1]
    }

    // ============ Constants ============
    /// @dev App command label for lzRead requests
    uint16 private constant APP_CMD_LABEL = 1;

    // ============ Settings ============
    struct Settings {
        uint256 maxPredictionMarkets;
        uint32 readChannelEid;          // LayerZero read channel endpoint ID (for _lzSend destination)
        uint32 targetEid;               // LayerZero endpoint ID of the chain with ConditionalTokens
        address conditionalTokens;      // Address of ConditionalTokens contract on remote chain
        uint16 confirmations;           // Block confirmations required for lzRead
        uint128 lzReadGasLimit;         // Gas limit for lzRead callback
        uint32 lzReadResultSize;        // Expected result size in bytes (32 for uint256)
    }

    Settings public config;

    // ============ Condition State ============
    struct ConditionState {
        bytes32 conditionId;
        bool settled;
        bool resolvedToYes;
        bool invalid;              // True if non-binary or other invalid state
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

    /// @dev Pending read request info - maps guid to condition + response type
    struct PendingRead {
        bytes32 conditionId;
        ResponseType responseType;
    }

    /// @dev Partial response data while waiting for all 3 responses
    struct PartialResponse {
        bool hasDenom;
        bool hasNoPayout;
        bool hasYesPayout;
        uint256 denom;
        uint256 noPayout;
        uint256 yesPayout;
    }

    /// @dev Mapping from conditionId to its cached state
    mapping(bytes32 => ConditionState) public conditions;
    
    /// @dev Track pending resolution requests to prevent duplicates
    mapping(bytes32 => bool) public pendingRequests;

    /// @dev Map guid -> pending read info for response correlation
    mapping(bytes32 => PendingRead) public pendingReads;

    /// @dev Map conditionId -> partial responses while collecting all 3
    mapping(bytes32 => PartialResponse) public partialResponses;

    // ============ Events ============
    event ResolutionRequested(
        bytes32 indexed conditionId,
        bytes32 indexed refCode,
        bytes32 guidDenom,
        bytes32 guidNoPayout,
        bytes32 guidYesPayout,
        uint256 timestamp
    );
    
    event ConditionResolved(
        bytes32 indexed conditionId,
        bool resolvedToYes,
        bool invalid,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        uint256 timestamp
    );

    event ConditionResponseReceived(
        bytes32 indexed conditionId,
        bytes32 indexed guid,
        ResponseType responseType,
        uint256 value,
        uint256 timestamp
    );
    
    event ConfigUpdated(
        uint32 readChannelEid,
        uint32 targetEid,
        address conditionalTokens,
        uint16 confirmations,
        uint128 lzReadGasLimit,
        uint32 lzReadResultSize,
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
            _config.readChannelEid,
            _config.targetEid,
            _config.conditionalTokens,
            _config.confirmations,
            _config.lzReadGasLimit,
            _config.lzReadResultSize,
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

            // If marked invalid (non-binary), treat as unsettled
            if (condition.invalid) {
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
     * @dev Sends 3 separate lzRead requests to fetch payoutDenominator and payoutNumerators
     */
    function requestResolution(
        bytes32 conditionId,
        bytes32 refCode
    ) external payable nonReentrant {
        if (conditionId == bytes32(0)) revert InvalidConditionId();
        if (conditions[conditionId].settled) revert ConditionAlreadySettled();
        if (pendingRequests[conditionId]) revert RequestAlreadyPending(conditionId);
        
        // Quote total fee for all 3 requests
        MessagingFee memory totalFee = _quoteTotalFee(conditionId);
        
        if (msg.value < totalFee.nativeFee) {
            revert InsufficientETHForFee(totalFee.nativeFee, msg.value);
        }

        // Mark request as pending
        pendingRequests[conditionId] = true;

        // Clear any stale partial responses
        delete partialResponses[conditionId];
        
        // Send 3 separate lzRead requests
        bytes32 guidDenom = _sendReadRequest(conditionId, ResponseType.DENOM);
        bytes32 guidNoPayout = _sendReadRequest(conditionId, ResponseType.NO_PAYOUT);
        bytes32 guidYesPayout = _sendReadRequest(conditionId, ResponseType.YES_PAYOUT);
        
        // Refund excess ETH
        uint256 excess = msg.value - totalFee.nativeFee;
        if (excess > 0) {
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            require(success, "Refund failed");
        }
        
        emit ResolutionRequested(conditionId, refCode, guidDenom, guidNoPayout, guidYesPayout, block.timestamp);
    }

    /**
     * @notice Quote the total fee for a resolution request (all 3 lzRead calls)
     * @param conditionId The conditionId to query
     * @return totalFee The total MessagingFee required for all 3 requests
     */
    function quoteResolution(bytes32 conditionId) external view returns (MessagingFee memory totalFee) {
        return _quoteTotalFee(conditionId);
    }

    /**
     * @dev Quote fee for all 3 lzRead requests
     */
    function _quoteTotalFee(bytes32 conditionId) internal view returns (MessagingFee memory totalFee) {
        MessagingFee memory feeDenom = _quoteSingleRequest(conditionId, ResponseType.DENOM);
        MessagingFee memory feeNo = _quoteSingleRequest(conditionId, ResponseType.NO_PAYOUT);
        MessagingFee memory feeYes = _quoteSingleRequest(conditionId, ResponseType.YES_PAYOUT);
        
        totalFee.nativeFee = feeDenom.nativeFee + feeNo.nativeFee + feeYes.nativeFee;
        totalFee.lzTokenFee = feeDenom.lzTokenFee + feeNo.lzTokenFee + feeYes.lzTokenFee;
    }

    /**
     * @dev Quote fee for a single lzRead request
     */
    function _quoteSingleRequest(bytes32 conditionId, ResponseType responseType) internal view returns (MessagingFee memory) {
        bytes memory cmd = _buildSingleReadCommand(conditionId, responseType);
        bytes memory options = _buildLzReadOptions();
        return _quote(config.readChannelEid, cmd, options, false);
    }

    /**
     * @dev Send a single lzRead request and store guid mapping
     */
    function _sendReadRequest(bytes32 conditionId, ResponseType responseType) internal returns (bytes32 guid) {
        bytes memory cmd = _buildSingleReadCommand(conditionId, responseType);
        bytes memory options = _buildLzReadOptions();
        MessagingFee memory fee = _quote(config.readChannelEid, cmd, options, false);
        
        MessagingReceipt memory receipt = _lzSend(
            config.readChannelEid,
            cmd,
            options,
            fee,
            payable(address(this)) // Refund to contract for multi-send
        );
        
        guid = receipt.guid;
        
        // Store mapping for response correlation
        pendingReads[guid] = PendingRead({
            conditionId: conditionId,
            responseType: responseType
        });
        
        return guid;
    }

    /**
     * @dev Build lzRead options using addExecutorLzReadOption
     */
    function _buildLzReadOptions() internal view returns (bytes memory) {
        return OptionsBuilder.newOptions()
            .addExecutorLzReadOption(config.lzReadGasLimit, config.lzReadResultSize, 0);
    }

    /**
     * @dev Build a single lzRead command for one view call
     */
    function _buildSingleReadCommand(bytes32 conditionId, ResponseType responseType) internal view returns (bytes memory) {
        EVMCallRequestV1[] memory requests = new EVMCallRequestV1[](1);
        
        bytes memory callData;
        uint16 appRequestLabel;
        
        if (responseType == ResponseType.DENOM) {
            appRequestLabel = 1;
            callData = abi.encodeWithSelector(
                IConditionalTokens.payoutDenominator.selector,
                conditionId
            );
        } else if (responseType == ResponseType.NO_PAYOUT) {
            appRequestLabel = 2;
            callData = abi.encodeWithSelector(
                IConditionalTokens.payoutNumerators.selector,
                conditionId,
                uint256(0)
            );
        } else {
            appRequestLabel = 3;
            callData = abi.encodeWithSelector(
                IConditionalTokens.payoutNumerators.selector,
                conditionId,
                uint256(1)
            );
        }
        
        requests[0] = EVMCallRequestV1({
            appRequestLabel: appRequestLabel,
            targetEid: config.targetEid,
            isBlockNum: false,
            blockNumOrTimestamp: 0, // Latest
            confirmations: config.confirmations,
            to: config.conditionalTokens,
            callData: callData
        });
        
        // No compute - raw response
        EVMCallComputeV1 memory compute;
        
        return ReadCodecV1.encode(APP_CMD_LABEL, requests, compute);
    }

    // ============ Override _payNative for Multi-Send ============
    
    /**
     * @dev Override to allow multiple _lzSend calls in one transaction
     *      Checks contract balance instead of msg.value for subsequent sends
     */
    function _payNative(uint256 _nativeFee) internal override returns (uint256 nativeFee) {
        // For multi-send: check that we have enough balance (from msg.value or prior deposits)
        if (address(this).balance < _nativeFee) revert InsufficientETHForFee(_nativeFee, address(this).balance);
        return _nativeFee;
    }

    // ============ LayerZero Receive Handler ============
    
    /**
     * @dev Handle lzRead response - decodes uint256 and correlates via guid
     */
    function _lzReceive(
        Origin calldata, // _origin - unused but required by interface
        bytes32 _guid,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override {
        // Look up the pending read by guid
        PendingRead memory pending = pendingReads[_guid];
        if (pending.conditionId == bytes32(0)) {
            revert UnknownGuid(_guid);
        }
        
        // Decode the raw uint256 response
        uint256 value = abi.decode(_message, (uint256));
        
        // Store the partial response
        bytes32 conditionId = pending.conditionId;
        PartialResponse storage partialResp = partialResponses[conditionId];
        
        if (pending.responseType == ResponseType.DENOM) {
            partialResp.denom = value;
            partialResp.hasDenom = true;
        } else if (pending.responseType == ResponseType.NO_PAYOUT) {
            partialResp.noPayout = value;
            partialResp.hasNoPayout = true;
        } else {
            partialResp.yesPayout = value;
            partialResp.hasYesPayout = true;
        }
        
        emit ConditionResponseReceived(conditionId, _guid, pending.responseType, value, block.timestamp);
        
        // Clean up the pending read
        delete pendingReads[_guid];
        
        // Check if we have all 3 responses
        if (partialResp.hasDenom && partialResp.hasNoPayout && partialResp.hasYesPayout) {
            _finalizeResolution(conditionId, partialResp.denom, partialResp.noPayout, partialResp.yesPayout);
            
            // Clean up partial responses
            delete partialResponses[conditionId];
            
            // Clear pending status
            pendingRequests[conditionId] = false;
        }
    }

    /**
     * @dev Finalize resolution - never reverts, marks invalid state if non-binary
     */
    function _finalizeResolution(
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
            condition.invalid = false;
            emit ConditionResolved(conditionId, false, false, denom, noPayout, yesPayout, block.timestamp);
            return;
        }
        
        // Validate strict binary condition
        // For a strict binary: no + yes == denom AND no != yes
        if (noPayout + yesPayout != denom || noPayout == yesPayout) {
            // Not a strict binary outcome - mark as invalid, don't revert
            condition.settled = false;
            condition.invalid = true;
            emit ConditionResolved(conditionId, false, true, denom, noPayout, yesPayout, block.timestamp);
            return;
        }
        
        // Valid binary outcome
        condition.settled = true;
        condition.invalid = false;
        condition.resolvedToYes = yesPayout > 0;
        
        emit ConditionResolved(
            conditionId,
            condition.resolvedToYes,
            false,
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

    function isConditionInvalid(bytes32 conditionId) external view returns (bool) {
        return conditions[conditionId].invalid;
    }

    function getConditionResolution(bytes32 conditionId) external view returns (bool resolvedToYes) {
        ConditionState memory condition = conditions[conditionId];
        require(condition.settled, "Condition not settled");
        return condition.resolvedToYes;
    }

    function isPendingRequest(bytes32 conditionId) external view returns (bool) {
        return pendingRequests[conditionId];
    }

    function getPartialResponse(bytes32 conditionId) external view returns (PartialResponse memory) {
        return partialResponses[conditionId];
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
