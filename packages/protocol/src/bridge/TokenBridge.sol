// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";
import {BridgeTypes} from "./BridgeTypes.sol";
import {TokenBridgeTypes} from "./TokenBridgeTypes.sol";
import {BridgeableToken} from "./BridgeableToken.sol";
import {CREATE2Deployer} from "./CREATE2Deployer.sol";
import {Encoder} from "./cmdEncoder.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {ETHManagement} from "./abstract/ETHManagement.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title TokenBridge
 * @notice LayerZero bridge for tokens between PM (Prediction Market) and SM (Secondary Market) sides
 * @dev This contract handles:
 * - Creating token pairs on both sides with deterministic addresses (CREATE2)
 * - Bridging tokens between chains with ACK confirmation
 * - Timeout and retry mechanisms for failed transfers
 * - Holding tokens in escrow during bridging
 */
contract TokenBridge is
    OApp,
    ILayerZeroBridge,
    ReentrancyGuard,
    ETHManagement
{
    using SafeERC20 for IERC20;
    using Encoder for bytes;
    using OptionsBuilder for bytes;
    using TokenBridgeTypes for TokenBridgeTypes.BridgeTransfer;

    // ============ Constants ============
    uint256 public constant DEFAULT_TIMEOUT = 1 hours; // Default timeout for bridge transfers
    uint256 public constant MAX_RETRIES = 3; // Maximum number of retries for failed transfers

    // ============ State Variables ============
    BridgeTypes.BridgeConfig private bridgeConfig;
    bool public immutable isPMSide; // Whether this bridge is on PM side
    
    // Token pair management: token address => TokenPair
    mapping(address => TokenBridgeTypes.TokenPair) public tokenPairs;
    mapping(bytes32 => address) public saltToToken; // salt => token address (for reverse lookup)
    
    // Bridge transfer tracking: transferId => BridgeTransfer
    mapping(bytes32 => TokenBridgeTypes.BridgeTransfer) public bridgeTransfers;
    
    // Escrow: token => user => amount
    mapping(address => mapping(address => uint256)) public escrowedBalances;
    
    // Nonce for generating unique transfer IDs
    uint256 private transferNonce;

    // ============ Events ============
    event TokenPairCreated(
        address indexed pmToken,
        address indexed smToken,
        string name,
        string symbol,
        bytes32 salt
    );
    
    event BridgeInitiated(
        bytes32 indexed transferId,
        address indexed token,
        address indexed user,
        uint256 amount,
        bool isFromPM
    );
    
    event BridgeCompleted(
        bytes32 indexed transferId,
        address indexed token,
        address indexed user,
        uint256 amount
    );
    
    event BridgeFailed(
        bytes32 indexed transferId,
        address indexed token,
        address indexed user,
        uint256 amount
    );
    
    event BridgeRetried(
        bytes32 indexed transferId,
        uint256 retryCount
    );
    
    event TokensEscrowed(
        address indexed token,
        address indexed user,
        uint256 amount
    );
    
    event TokensReleased(
        address indexed token,
        address indexed user,
        uint256 amount
    );
    
    event TokenPairAcknowledged(
        address indexed token,
        bytes32 salt
    );

    // ============ Custom Errors ============
    error TokenPairAlreadyExists(address token);
    error TokenPairNotFound(address token);
    error InvalidTokenAddress(address token);
    error InsufficientBalance(address token, address user, uint256 required, uint256 available);
    error TransferNotFound(bytes32 transferId);
    error TransferNotPending(bytes32 transferId);
    error TransferNotFailed(bytes32 transferId);
    error TransferNotTimedOut(bytes32 transferId);
    error MaxRetriesExceeded(bytes32 transferId);
    error InvalidSourceChain(uint32 expectedEid, uint32 actualEid);
    error InvalidSender(address expectedSender, address actualSender);
    error InvalidCommandType(uint16 commandType);
    error TokenPairNotAcknowledged(address token);
    error OnlyPMSideCanCreatePairs();

    // ============ Constructor ============
    constructor(
        address _endpoint,
        address _owner,
        bool _isPMSide
    ) OApp(_endpoint, _owner) ETHManagement(_owner) {
        isPMSide = _isPMSide;
    }

    // ============ Configuration Functions ============
    function setBridgeConfig(BridgeTypes.BridgeConfig calldata _config) external override onlyOwner {
        bridgeConfig = _config;
        emit BridgeConfigUpdated(_config);
    }

    function getBridgeConfig() external view override returns (BridgeTypes.BridgeConfig memory) {
        return bridgeConfig;
    }

    // ============ Token Pair Creation ============
    /**
     * @notice Create a new token pair on the PM side
     * @dev This will deploy a token on this side and send a message to create the pair on the remote side
     * @dev Only callable on PM side
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @param salt Salt for CREATE2 deployment (must be same on both sides)
     */
    function createTokenPair(
        string memory name,
        string memory symbol,
        uint8 decimals,
        bytes32 salt
    ) external onlyOwner nonReentrant {
        if (!isPMSide) {
            revert OnlyPMSideCanCreatePairs();
        }
        // Compute the token address using CREATE2
        bytes memory bytecode = abi.encodePacked(
            type(BridgeableToken).creationCode,
            abi.encode(name, symbol, decimals, address(this))
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        address tokenAddress = CREATE2Deployer.computeAddress(
            address(this),
            salt,
            bytecodeHash
        );

        // Check if token already exists
        if (tokenPairs[tokenAddress].exists) {
            revert TokenPairAlreadyExists(tokenAddress);
        }

        // Deploy the token using CREATE2
        address deployedToken = CREATE2Deployer.deploy(bytecode, salt);
        require(deployedToken == tokenAddress, "CREATE2 address mismatch");

        // Store token pair info
        // Since CREATE2 ensures same address on both sides, we set both addresses
        TokenBridgeTypes.TokenPair storage pair = tokenPairs[deployedToken];
        pair.pmToken = deployedToken;
        pair.smToken = deployedToken; // Same address due to CREATE2
        pair.exists = true;
        pair.acknowledged = false; // Will be set to true when remote side sends ACK
        saltToToken[salt] = deployedToken;

        // Send message to remote side to create the pair
        bytes memory commandPayload = Encoder.encodeCreateTokenPair(name, symbol, decimals, salt);
        _sendLayerZeroMessage(Encoder.CMD_CREATE_TOKEN_PAIR, commandPayload);

        emit TokenPairCreated(deployedToken, deployedToken, name, symbol, salt);
    }

    /**
     * @notice Handle token pair creation from remote side
     * @dev Called via LayerZero when remote side creates a token pair
     */
    function _handleCreateTokenPair(
        string memory name,
        string memory symbol,
        uint8 decimals,
        bytes32 salt
    ) internal {
        // Compute the token address using CREATE2 (same as remote side)
        bytes memory bytecode = abi.encodePacked(
            type(BridgeableToken).creationCode,
            abi.encode(name, symbol, decimals, address(this))
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        address tokenAddress = CREATE2Deployer.computeAddress(
            address(this),
            salt,
            bytecodeHash
        );

        // Check if token already exists
        if (tokenPairs[tokenAddress].exists) {
            revert TokenPairAlreadyExists(tokenAddress);
        }

        // Deploy the token using CREATE2
        address deployedToken = CREATE2Deployer.deploy(bytecode, salt);
        require(deployedToken == tokenAddress, "CREATE2 address mismatch");

        // Store token pair info
        // Since CREATE2 ensures same address on both sides, we set both addresses
        TokenBridgeTypes.TokenPair storage pair = tokenPairs[deployedToken];
        pair.pmToken = deployedToken; // Same address due to CREATE2
        pair.smToken = deployedToken;
        pair.exists = true;
        pair.acknowledged = true; // On SM side, we acknowledge immediately since we created it
        saltToToken[salt] = deployedToken;

        // Send ACK back to PM side
        bytes memory ackPayload = Encoder.encodeCreateTokenPairAck(deployedToken);
        _sendLayerZeroMessage(Encoder.CMD_CREATE_TOKEN_PAIR_ACK, ackPayload);

        emit TokenPairCreated(deployedToken, deployedToken, name, symbol, salt);
    }

    /**
     * @notice Handle ACK for token pair creation from remote side
     * @dev Called via LayerZero when remote side acknowledges token pair creation
     */
    function _handleCreateTokenPairAck(address token) internal {
        TokenBridgeTypes.TokenPair storage pair = tokenPairs[token];
        if (!pair.exists) {
            revert TokenPairNotFound(token);
        }

        // Mark as acknowledged
        pair.acknowledged = true;

        emit TokenPairAcknowledged(token, bytes32(0)); // Salt not needed for ACK event
    }

    // ============ Bridge Functions ============
    /**
     * @notice Bridge tokens to the remote side
     * @dev On PM side, bridges to SM. On SM side, bridges to PM.
     * @param token Token address
     * @param amount Amount of tokens to bridge
     */
    function bridgeTokens(address token, uint256 amount) external nonReentrant {
        _bridgeTokens(token, amount, isPMSide);
    }

    /**
     * @notice Internal function to bridge tokens
     * @param token Token address
     * @param amount Amount to bridge
     * @param isFromPM true if bridging FROM PM side, false if FROM SM side
     */
    function _bridgeTokens(address token, uint256 amount, bool isFromPM) internal {
        // Validate token pair exists and is acknowledged on both sides
        TokenBridgeTypes.TokenPair memory pair = tokenPairs[token];
        if (!pair.exists) {
            revert TokenPairNotFound(token);
        }
        if (!pair.acknowledged) {
            revert TokenPairNotAcknowledged(token);
        }

        // Transfer tokens from user to escrow
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        escrowedBalances[token][msg.sender] += amount;
        emit TokensEscrowed(token, msg.sender, amount);

        // Generate unique transfer ID
        bytes32 transferId = keccak256(
            abi.encodePacked(
                block.chainid,
                address(this),
                msg.sender,
                token,
                amount,
                transferNonce++,
                block.timestamp
            )
        );

        // Create bridge transfer record
        TokenBridgeTypes.BridgeTransfer storage transfer = bridgeTransfers[transferId];
        transfer.transferId = transferId;
        transfer.token = token;
        transfer.user = msg.sender;
        transfer.amount = amount;
        transfer.timestamp = block.timestamp;
        transfer.timeout = block.timestamp + DEFAULT_TIMEOUT;
        transfer.status = TokenBridgeTypes.BridgeStatus.Pending;
        transfer.isFromPM = isFromPM;
        transfer.retryCount = 0;

        // Send LayerZero message to remote side
        address remoteToken = isFromPM ? pair.smToken : pair.pmToken;
        bytes memory commandPayload = Encoder.encodeBridgeTokens(
            transferId,
            remoteToken,
            msg.sender,
            amount
        );
        _sendLayerZeroMessage(Encoder.CMD_BRIDGE_TOKENS, commandPayload);

        emit BridgeInitiated(transferId, token, msg.sender, amount, isFromPM);
    }

    /**
     * @notice Handle incoming bridge request from remote side
     * @dev Called via LayerZero when remote side initiates a bridge
     * @param transferId Unique transfer identifier
     * @param token Token address (same on both sides due to CREATE2)
     * @param user User address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function _handleBridgeTokens(
        bytes32 transferId,
        address token,
        address user,
        uint256 amount
    ) internal {
        // Validate token pair exists
        // Since CREATE2 ensures same address on both sides, we can use the token address directly
        TokenBridgeTypes.TokenPair memory pair = tokenPairs[token];
        if (!pair.exists) {
            revert TokenPairNotFound(token);
        }

        // Check if this transfer ID already exists (prevent duplicates)
        if (bridgeTransfers[transferId].transferId != bytes32(0)) {
            // Transfer already processed, send ACK
            _sendAck(transferId);
            return;
        }

        // Mint tokens to user on this side
        BridgeableToken(token).mint(user, amount);

        // Create bridge transfer record (for tracking)
        TokenBridgeTypes.BridgeTransfer storage transfer = bridgeTransfers[transferId];
        transfer.transferId = transferId;
        transfer.token = token;
        transfer.user = user;
        transfer.amount = amount;
        transfer.timestamp = block.timestamp;
        transfer.status = TokenBridgeTypes.BridgeStatus.Completed;

        // Send ACK back to source side
        _sendAck(transferId);

        emit BridgeCompleted(transferId, token, user, amount);
    }

    /**
     * @notice Handle ACK from remote side
     * @dev Called via LayerZero when remote side confirms bridge completion
     */
    function _handleBridgeAck(bytes32 transferId) internal {
        TokenBridgeTypes.BridgeTransfer storage transfer = bridgeTransfers[transferId];
        if (transfer.transferId == bytes32(0)) {
            revert TransferNotFound(transferId);
        }

        if (transfer.status != TokenBridgeTypes.BridgeStatus.Pending &&
            transfer.status != TokenBridgeTypes.BridgeStatus.Retrying) {
            revert TransferNotPending(transferId);
        }

        // Release escrowed tokens (burn them since they're now on the other side)
        BridgeableToken(transfer.token).burn(transfer.amount);
        escrowedBalances[transfer.token][transfer.user] -= transfer.amount;
        emit TokensReleased(transfer.token, transfer.user, transfer.amount);

        // Update transfer status
        transfer.status = TokenBridgeTypes.BridgeStatus.Completed;

        emit BridgeCompleted(transferId, transfer.token, transfer.user, transfer.amount);
    }

    /**
     * @notice Retry a failed bridge transfer
     * @param transferId Transfer ID to retry
     */
    function retryBridge(bytes32 transferId) external nonReentrant {
        TokenBridgeTypes.BridgeTransfer storage transfer = bridgeTransfers[transferId];
        if (transfer.transferId == bytes32(0)) {
            revert TransferNotFound(transferId);
        }

        if (transfer.status != TokenBridgeTypes.BridgeStatus.Failed) {
            revert TransferNotFailed(transferId);
        }

        // Check retry count
        if (transfer.retryCount >= MAX_RETRIES) {
            revert MaxRetriesExceeded(transferId);
        }

        // Get token pair
        TokenBridgeTypes.TokenPair memory pair = tokenPairs[transfer.token];
        address remoteToken = transfer.isFromPM ? pair.smToken : pair.pmToken;

        // Update transfer status
        transfer.status = TokenBridgeTypes.BridgeStatus.Retrying;
        transfer.timestamp = block.timestamp;
        transfer.timeout = block.timestamp + DEFAULT_TIMEOUT;
        transfer.retryCount += 1;

        // Resend LayerZero message
        bytes memory commandPayload = Encoder.encodeBridgeTokens(
            transferId,
            remoteToken,
            transfer.user,
            transfer.amount
        );
        _sendLayerZeroMessage(Encoder.CMD_BRIDGE_RETRY, commandPayload);

        emit BridgeRetried(transferId, transfer.retryCount);
    }

    /**
     * @notice Mark a transfer as failed due to timeout
     * @param transferId Transfer ID to mark as failed
     */
    function markTransferFailed(bytes32 transferId) external {
        TokenBridgeTypes.BridgeTransfer storage transfer = bridgeTransfers[transferId];
        if (transfer.transferId == bytes32(0)) {
            revert TransferNotFound(transferId);
        }

        if (block.timestamp < transfer.timeout) {
            revert TransferNotTimedOut(transferId);
        }

        if (transfer.status != TokenBridgeTypes.BridgeStatus.Pending &&
            transfer.status != TokenBridgeTypes.BridgeStatus.Retrying) {
            revert TransferNotPending(transferId);
        }

        transfer.status = TokenBridgeTypes.BridgeStatus.Failed;
        emit BridgeFailed(transferId, transfer.token, transfer.user, transfer.amount);
    }

    /**
     * @notice Refund tokens from a failed bridge transfer
     * @param transferId Transfer ID to refund
     */
    function refundFailedTransfer(bytes32 transferId) external nonReentrant {
        TokenBridgeTypes.BridgeTransfer storage transfer = bridgeTransfers[transferId];
        if (transfer.transferId == bytes32(0)) {
            revert TransferNotFound(transferId);
        }

        if (transfer.status != TokenBridgeTypes.BridgeStatus.Failed) {
            revert TransferNotFailed(transferId);
        }

        // Return escrowed tokens to user
        escrowedBalances[transfer.token][transfer.user] -= transfer.amount;
        IERC20(transfer.token).safeTransfer(transfer.user, transfer.amount);
        emit TokensReleased(transfer.token, transfer.user, transfer.amount);

        // Clear transfer record
        delete bridgeTransfers[transferId];
    }

    // ============ LayerZero Message Handling ============
    function _lzReceive(
        Origin calldata _origin,
        bytes32,
        bytes calldata _message,
        address,
        bytes calldata
    ) internal override {
        // Validate source chain
        if (_origin.srcEid != bridgeConfig.remoteEid) {
            revert InvalidSourceChain(bridgeConfig.remoteEid, _origin.srcEid);
        }

        // Validate sender
        if (address(uint160(uint256(_origin.sender))) != bridgeConfig.remoteBridge) {
            revert InvalidSender(
                bridgeConfig.remoteBridge,
                address(uint160(uint256(_origin.sender)))
            );
        }

        // Decode message
        (uint16 commandType, bytes memory data) = _message.decodeType();

        if (commandType == Encoder.CMD_CREATE_TOKEN_PAIR) {
            (string memory name, string memory symbol, uint8 decimals, bytes32 salt) =
                data.decodeCreateTokenPair();
            _handleCreateTokenPair(name, symbol, decimals, salt);
        } else if (commandType == Encoder.CMD_CREATE_TOKEN_PAIR_ACK) {
            address token = data.decodeCreateTokenPairAck();
            _handleCreateTokenPairAck(token);
        } else if (commandType == Encoder.CMD_BRIDGE_TOKENS || commandType == Encoder.CMD_BRIDGE_RETRY) {
            (bytes32 transferId, address token, address user, uint256 amount) =
                data.decodeBridgeTokens();
            _handleBridgeTokens(transferId, token, user, amount);
        } else if (commandType == Encoder.CMD_BRIDGE_ACK) {
            bytes32 transferId = data.decodeBridgeAck();
            _handleBridgeAck(transferId);
        } else {
            revert InvalidCommandType(commandType);
        }
    }

    // ============ Internal Helper Functions ============
    /**
     * @notice Send a LayerZero message
     */
    function _sendLayerZeroMessage(uint16 commandType, bytes memory payload) internal {
        bytes memory message = abi.encode(commandType, payload);
        
        MessagingFee memory fee = _quote(
            bridgeConfig.remoteEid,
            message,
            false,
            OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0)
        );

        _requireSufficientETH(fee.nativeFee);

        _lzSend(
            bridgeConfig.remoteEid,
            message,
            OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0),
            MessagingReceipt(address(0), fee.nativeFee, fee.lzTokenFee)
        );
    }

    /**
     * @notice Send ACK message
     */
    function _sendAck(bytes32 transferId) internal {
        bytes memory commandPayload = Encoder.encodeBridgeAck(transferId);
        _sendLayerZeroMessage(Encoder.CMD_BRIDGE_ACK, commandPayload);
    }

    // ============ View Functions ============
    function getTokenPair(address token) external view returns (TokenBridgeTypes.TokenPair memory) {
        return tokenPairs[token];
    }

    function getBridgeTransfer(bytes32 transferId)
        external
        view
        returns (TokenBridgeTypes.BridgeTransfer memory)
    {
        return bridgeTransfers[transferId];
    }

    function getEscrowedBalance(address token, address user) external view returns (uint256) {
        return escrowedBalances[token][user];
    }
}

