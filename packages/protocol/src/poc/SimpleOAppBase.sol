// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BridgeTypes} from "../bridge/BridgeTypes.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

/**
 * @title SimpleOAppBase
 * @notice Simple OApp implementation for Base network
 * @dev The constructor internally calls OApp with Base LayerZero endpoint and factory as owner
 */
contract SimpleOAppBase is OApp {
    using OptionsBuilder for bytes;

    address public immutable factory;

    // Base LayerZero endpoint (same for mainnet and testnet)
    address private constant BASE_ENDPOINT = 0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7;

    // LayerZero EIDs
    // Mainnet: Arbitrum = 30110, Base = 30140
    // Testnet: Arbitrum Sepolia = 40231, Base Sepolia = 40245
    uint32 private immutable ARBITRUM_EID;
    uint32 private immutable BASE_EID;

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
     * @notice Constructor that accepts factory address
     * @param _factory The address of the factory that deploys this contract
     * @dev Internally calls OApp constructor with Base endpoint and factory as owner
     *      Automatically detects if running on testnet or mainnet based on chain ID
     */
    constructor(address _factory) Ownable(_factory) OApp(BASE_ENDPOINT, _factory) {
        factory = _factory;
        
        // Detect network: Base Sepolia = 84532, Base = 8453
        uint256 chainId = block.chainid;
        if (chainId == 84532) {
            // Base Sepolia testnet
            ARBITRUM_EID = 40231;
            BASE_EID = 40245;
        } else {
            // Base mainnet (or other networks)
            ARBITRUM_EID = 30110;
            BASE_EID = 30140;
        }
        
        // The constructors are called with:
        // - Ownable: _factory (the factory that deploys this contract, becomes the owner)
        // - OApp: BASE_ENDPOINT and _factory (delegate)
    }

    /**
     * @notice Setup LayerZero configuration
     * @dev Can only be called once. Sets up peer and bridge config.
     *      Since CREATE3 ensures same address on both networks, the peer is this contract's address.
     *      Anyone can call this function as it doesn't take parameters or transfer tokens.
     */
    function setupLayerZero() external {
        if (_setupComplete) {
            revert SetupAlreadyComplete();
        }

        // Set peer: Arbitrum network EID pointing to this contract (same address on Arbitrum)
        bytes32 peerAddress = bytes32(uint256(uint160(address(this))));
        setPeer(ARBITRUM_EID, peerAddress);

        // Set bridge config: remote is Arbitrum network with this contract's address
        bridgeConfig = BridgeTypes.BridgeConfig({
            remoteEid: ARBITRUM_EID,
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
     * @dev Sends the value via LayerZero to the pair contract on Arbitrum network
     *      Requires setup to be complete and sufficient ETH for fees
     */
    function sendValue(uint256 value) external payable {
        if (!_setupComplete) {
            revert SetupNotComplete();
        }

        // Encode the value as the message payload
        bytes memory payload = abi.encode(value);

        // Build options with executor LZ receive option
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(0, 0);

        // Get quote for the message
        MessagingFee memory fee = _quote(
            ARBITRUM_EID,
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
            ARBITRUM_EID,
            payload,
            options,
            fee,
            payable(msg.sender)
        );

        emit ValueSent(value, ARBITRUM_EID);
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

        bytes memory payload = abi.encode(value);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(0, 0);

        MessagingFee memory fee = _quote(
            ARBITRUM_EID,
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
        // Verify the message is from the expected source EID
        if (_origin.srcEid != ARBITRUM_EID) {
            revert InvalidSourceEid(ARBITRUM_EID, _origin.srcEid);
        }

        // CRITICAL: Verify the sender is the paired contract (same address on Arbitrum network)
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

