// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BridgeTypes} from "../bridge/BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

/**
 * @title SimpleOAppBase
 * @notice Base contract for SimpleOApp implementations
 * @dev Contains all common logic, to be extended by network-specific implementations
 */
abstract contract SimpleOAppBase is OApp {
    using OptionsBuilder for bytes;

    address public immutable factory;

    // Setup flag
    bool private _setupComplete;

    // Bridge config storage
    BridgeTypes.BridgeConfig private bridgeConfig;

    // Value storage for PoC
    uint256 private _receivedValue;

    // ============ Errors ============
    error SetupAlreadyComplete();
    error SetupNotComplete();
    error InsufficientFee(uint256 required, uint256 provided);
    error InvalidSourceEid(uint32 expected, uint32 actual);
    error InvalidSender(address expected, address actual);

    // ============ Events ============
    event BridgeConfigUpdated(BridgeTypes.BridgeConfig config);
    event ValueSent(uint256 value, uint32 destinationEid);
    event ValueReceived(uint256 value, uint32 sourceEid);

    /**
     * @notice Constructor that accepts factory address and endpoint
     * @param _factory The address of the factory that deploys this contract
     * @param _endpoint The LayerZero endpoint address for this network
     * @dev Internally calls OApp constructor with endpoint and factory as owner/delegate
     */
    constructor(address _factory, address _endpoint) OApp(_endpoint, _factory) Ownable(_factory) {
        factory = _factory;
    }

    /**
     * @notice Get the LayerZero endpoint address for this network
     * @return The endpoint address
     */
    function getEndpoint() public view virtual returns (address);

    /**
     * @notice Get the local EID (this network's EID)
     * @return The local EID
     */
    function getLocalEid() public view virtual returns (uint32);

    /**
     * @notice Get the remote EID (the other network's EID)
     * @return The remote EID
     */
    function getRemoteEid() public view virtual returns (uint32);

    /**
     * @notice Setup LayerZero configuration
     * @dev Can only be called once. Sets up bridge config.
     *      Note: The peer is automatically set by the factory when the pair is created.
     *      This function only sets up the internal bridge config state.
     *      Anyone can call this function as it doesn't take parameters or transfer tokens.
     */
    function setupLayerZero() external {
        if (_setupComplete) {
            revert SetupAlreadyComplete();
        }

        uint32 remoteEid = getRemoteEid();

        // Set bridge config: remote network with this contract's address
        bridgeConfig = BridgeTypes.BridgeConfig({
            remoteEid: remoteEid,
            remoteBridge: address(this)
        });
        emit BridgeConfigUpdated(bridgeConfig);

        _setupComplete = true;
    }

    /**
     * @notice Get bridge config
     * @return The bridge configuration
     */
    function getBridgeConfig() external view returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    /**
     * @notice Check if setup is complete
     * @return True if setup has been completed
     */
    function isSetupComplete() external view returns (bool) {
        return _setupComplete;
    }

    /**
     * @notice Send a value to the pair on the other network
     * @param value The value to send
     * @dev Sends the value via LayerZero to the pair contract on the remote network
     *      Requires setup to be complete and sufficient ETH for fees
     */
    function sendValue(uint256 value) external payable {
        if (!_setupComplete) {
            revert SetupNotComplete();
        }

        uint32 remoteEid = getRemoteEid();

        // Encode the value as the message payload
        bytes memory payload = abi.encode(value);

        // Build options with executor LZ receive option
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(0, 0);

        // Get quote for the message
        MessagingFee memory fee = _quote(
            remoteEid,
            payload,
            options,
            false // payInLzToken
        );

        // Check if sufficient ETH was provided
        if (msg.value < fee.nativeFee) {
            revert InsufficientFee(fee.nativeFee, msg.value);
        }

        // Refund excess ETH to the caller
        uint256 excess = msg.value - fee.nativeFee;
        if (excess > 0) {
            payable(msg.sender).transfer(excess);
        }

        // Send the message
        MessagingReceipt memory receipt = _lzSend(
            remoteEid,
            payload,
            options,
            fee,
            payable(msg.sender)
        );

        emit ValueSent(value, remoteEid);
    }

    /**
     * @notice Get quote for sending a value
     * @param value The value to send
     * @return nativeFee The native token fee required
     * @return lzTokenFee The LZ token fee (unused in this implementation)
     * @dev Use this to get the required fee before calling sendValue
     */
    function quoteSendValue(uint256 value) external view returns (uint256 nativeFee, uint256 lzTokenFee) {
        if (!_setupComplete) {
            revert SetupNotComplete();
        }

        uint32 remoteEid = getRemoteEid();

        bytes memory payload = abi.encode(value);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(0, 0);

        MessagingFee memory fee = _quote(
            remoteEid,
            payload,
            options,
            false // payInLzToken
        );

        return (fee.nativeFee, fee.lzTokenFee);
    }

    /**
     * @notice Get the value received from the other network
     * @return The value received from the pair on the other network
     */
    function getValue() external view returns (uint256) {
        return _receivedValue;
    }

    /**
     * @notice Receive function for LayerZero messages
     * @param _origin The origin information
     * @param _guid The message GUID
     * @param _message The message payload
     * @param _executor The executor address
     * @param _extraData Extra data
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        uint32 expectedSourceEid = getRemoteEid();

        // Verify the message is from the expected source EID
        if (_origin.srcEid != expectedSourceEid) {
            revert InvalidSourceEid(expectedSourceEid, _origin.srcEid);
        }

        // CRITICAL: Verify the sender is the paired contract (same address on remote network)
        address expectedSender = address(this);
        address actualSender = address(uint160(uint256(_origin.sender)));
        if (actualSender != expectedSender) {
            revert InvalidSender(expectedSender, actualSender);
        }

        // Decode the value from the message
        uint256 value = abi.decode(_message, (uint256));

        // Update the received value
        _receivedValue = value;

        emit ValueReceived(value, _origin.srcEid);
    }
}
