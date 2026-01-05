// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {TokenBridge} from "../../src/bridge/TokenBridge.sol";
import {BridgeableToken} from "../../src/bridge/BridgeableToken.sol";
import {Encoder} from "../../src/bridge/cmdEncoder.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {TokenBridgeTypes} from "../../src/bridge/TokenBridgeTypes.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

/**
 * @title TokenBridgeTestWrapper
 * @notice Wrapper to expose internal functions for testing
 */
contract TokenBridgeTestWrapper is TokenBridge {
    constructor(
        address _endpoint,
        address _owner,
        bool _isPMSide
    ) TokenBridge(_endpoint, _owner, _isPMSide) {}

    function exposed_lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external {
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }

    function exposed_handleCreateTokenPair(
        string memory name,
        string memory symbol,
        uint8 decimals,
        bytes32 salt
    ) external {
        _handleCreateTokenPair(name, symbol, decimals, salt);
    }

    function exposed_handleCreateTokenPairAck(address token) external {
        _handleCreateTokenPairAck(token);
    }

    function exposed_handleBridgeTokens(
        bytes32 transferId,
        address token,
        address user,
        uint256 amount
    ) external {
        _handleBridgeTokens(transferId, token, user, amount);
    }

    function exposed_handleBridgeAck(bytes32 transferId) external {
        _handleBridgeAck(transferId);
    }
}

/**
 * @title TokenBridgeTest
 * @notice Test suite for TokenBridge
 */
contract TokenBridgeTest is TestHelperOz5 {
    using Cannon for Vm;

    // Users
    address private owner = address(this);
    address private user = address(0x1);
    address private unauthorizedUser = address(0x2);

    // Contracts
    TokenBridgeTestWrapper private pmBridge;
    TokenBridgeTestWrapper private smBridge;

    // LZ data
    uint32 private pmEid = 1;
    uint32 private smEid = 2;

    // Test data
    string private constant TOKEN_NAME = "TestToken";
    string private constant TOKEN_SYMBOL = "TTK";
    uint8 private constant TOKEN_DECIMALS = 18;
    bytes32 private constant TOKEN_SALT = keccak256("TestToken");
    uint256 private constant INITIAL_SUPPLY = 1000 ether;
    uint256 private constant BRIDGE_AMOUNT = 100 ether;

    function setUp() public override {
        vm.deal(owner, 100 ether);
        vm.deal(user, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy PM-side bridge
        pmBridge = TokenBridgeTestWrapper(
            payable(
                _deployOApp(
                    type(TokenBridgeTestWrapper).creationCode,
                    abi.encode(address(endpoints[pmEid]), owner, true)
                )
            )
        );

        // Deploy SM-side bridge
        smBridge = TokenBridgeTestWrapper(
            payable(
                _deployOApp(
                    type(TokenBridgeTestWrapper).creationCode,
                    abi.encode(address(endpoints[smEid]), owner, false)
                )
            )
        );

        // Wire OApps together
        address[] memory oapps = new address[](2);
        oapps[0] = address(pmBridge);
        oapps[1] = address(smBridge);
        this.wireOApps(oapps);

        vm.deal(address(pmBridge), 10 ether);
        vm.deal(address(smBridge), 10 ether);

        // Configure bridges
        pmBridge.setBridgeConfig(
            BridgeTypes.BridgeConfig({remoteEid: smEid, remoteBridge: address(smBridge)})
        );
        smBridge.setBridgeConfig(
            BridgeTypes.BridgeConfig({remoteEid: pmEid, remoteBridge: address(pmBridge)})
        );
    }

    // ============ Helper Functions ============

    function _computeTransferId(
        address bridge,
        address user,
        address token,
        uint256 amount,
        uint256 nonce
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                block.chainid,
                bridge,
                user,
                token,
                amount,
                nonce,
                block.timestamp
            )
        );
    }

    function _createTokenPair() internal returns (address token) {
        pmBridge.createTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT);

        // Compute expected token address
        bytes memory bytecode = abi.encodePacked(
            type(BridgeableToken).creationCode,
            abi.encode(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, address(pmBridge))
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        token = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(pmBridge),
                            TOKEN_SALT,
                            bytecodeHash
                        )
                    )
                )
            )
        );

        // Simulate SM side receiving the message
        bytes memory message = abi.encode(
            Encoder.CMD_CREATE_TOKEN_PAIR,
            Encoder.encodeCreateTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT)
        );
        Origin memory origin = Origin({
            srcEid: pmEid,
            sender: bytes32(uint256(uint160(address(pmBridge)))),
            nonce: 0
        });
        smBridge.exposed_lzReceive(origin, bytes32(0), message, address(0), "");

        // Simulate PM side receiving ACK
        bytes memory ackMessage = abi.encode(Encoder.CMD_CREATE_TOKEN_PAIR_ACK, Encoder.encodeCreateTokenPairAck(token));
        Origin memory ackOrigin = Origin({
            srcEid: smEid,
            sender: bytes32(uint256(uint160(address(smBridge)))),
            nonce: 0
        });
        pmBridge.exposed_lzReceive(ackOrigin, bytes32(0), ackMessage, address(0), "");

        return token;
    }

    function _mintTokensToUser(address token, address user, uint256 amount) internal {
        BridgeableToken(token).mint(user, amount);
    }

    function _simulateBridgeMessage(
        bool fromPM,
        bytes32 transferId,
        address token,
        address user,
        uint256 amount
    ) internal {
        bytes memory message = abi.encode(
            Encoder.CMD_BRIDGE_TOKENS,
            Encoder.encodeBridgeTokens(transferId, token, user, amount)
        );
        Origin memory origin = Origin({
            srcEid: fromPM ? pmEid : smEid,
            sender: bytes32(uint256(uint160(fromPM ? address(pmBridge) : address(smBridge)))),
            nonce: 0
        });
        TokenBridgeTestWrapper targetBridge = fromPM ? smBridge : pmBridge;
        targetBridge.exposed_lzReceive(origin, bytes32(0), message, address(0), "");
    }

    function _simulateBridgeAck(bool fromPM, bytes32 transferId) internal {
        bytes memory message = abi.encode(Encoder.CMD_BRIDGE_ACK, Encoder.encodeBridgeAck(transferId));
        Origin memory origin = Origin({
            srcEid: fromPM ? smEid : pmEid,
            sender: bytes32(uint256(uint160(fromPM ? address(smBridge) : address(pmBridge)))),
            nonce: 0
        });
        TokenBridgeTestWrapper targetBridge = fromPM ? pmBridge : smBridge;
        targetBridge.exposed_lzReceive(origin, bytes32(0), message, address(0), "");
    }

    // ============ Constructor Tests ============

    function test_constructor_pmSide() public view {
        assertTrue(pmBridge.isPMSide(), "PM bridge should be marked as PM side");
    }

    function test_constructor_smSide() public view {
        assertFalse(smBridge.isPMSide(), "SM bridge should not be marked as PM side");
    }

    // ============ Configuration Tests ============

    function test_setBridgeConfig() public {
        BridgeTypes.BridgeConfig memory newConfig =
            BridgeTypes.BridgeConfig({remoteEid: 999, remoteBridge: address(0x1234)});

        pmBridge.setBridgeConfig(newConfig);

        BridgeTypes.BridgeConfig memory retrievedConfig = pmBridge.getBridgeConfig();
        assertEq(retrievedConfig.remoteEid, 999, "Remote EID should be updated");
        assertEq(retrievedConfig.remoteBridge, address(0x1234), "Remote bridge should be updated");
    }

    function test_setBridgeConfig_onlyOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        pmBridge.setBridgeConfig(
            BridgeTypes.BridgeConfig({remoteEid: smEid, remoteBridge: address(smBridge)})
        );
    }

    // ============ Token Pair Creation Tests ============

    function test_createTokenPair_pmSide() public {
        pmBridge.createTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT);

        // Compute expected token address
        bytes memory bytecode = abi.encodePacked(
            type(BridgeableToken).creationCode,
            abi.encode(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, address(pmBridge))
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        address expectedToken = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(pmBridge),
                            TOKEN_SALT,
                            bytecodeHash
                        )
                    )
                )
            )
        );

        TokenBridgeTypes.TokenPair memory pair = pmBridge.getTokenPair(expectedToken);
        assertTrue(pair.exists, "Token pair should exist");
        assertEq(pair.pmToken, expectedToken, "PM token address should match");
        assertEq(pair.smToken, expectedToken, "SM token address should match");
        assertFalse(pair.acknowledged, "Token pair should not be acknowledged yet");
    }

    function test_createTokenPair_smSide_reverts() public {
        vm.expectRevert(TokenBridge.OnlyPMSideCanCreatePairs.selector);
        smBridge.createTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT);
    }

    function test_createTokenPair_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit TokenBridge.TokenPairCreated(
            address(0), // Will be set after deployment
            address(0),
            TOKEN_NAME,
            TOKEN_SYMBOL,
            TOKEN_SALT
        );

        pmBridge.createTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT);
    }

    function test_createTokenPair_duplicate_reverts() public {
        pmBridge.createTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT);

        vm.expectRevert(TokenBridge.TokenPairAlreadyExists.selector);
        pmBridge.createTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT);
    }

    function test_createTokenPair_acknowledgment() public {
        address token = _createTokenPair();

        TokenBridgeTypes.TokenPair memory pmPair = pmBridge.getTokenPair(token);
        assertTrue(pmPair.acknowledged, "PM side token pair should be acknowledged");

        TokenBridgeTypes.TokenPair memory smPair = smBridge.getTokenPair(token);
        assertTrue(smPair.acknowledged, "SM side token pair should be acknowledged");
    }

    // ============ Bridge Token Tests ============

    function test_bridgeTokens_pmToSm() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        // Record logs to capture transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Check escrow
        uint256 escrowed = pmBridge.getEscrowedBalance(token, user);
        assertEq(escrowed, BRIDGE_AMOUNT, "Tokens should be escrowed");

        // Get transfer ID from event (first BridgeInitiated event)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        bytes32 bridgeInitiatedSig = keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == bridgeInitiatedSig) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }
        assertTrue(transferId != bytes32(0), "Transfer ID should be captured");

        // Simulate remote side receiving message and minting
        _simulateBridgeMessage(true, transferId, token, user, BRIDGE_AMOUNT);

        // Check tokens minted on SM side
        uint256 smBalance = BridgeableToken(token).balanceOf(user);
        assertEq(smBalance, BRIDGE_AMOUNT, "Tokens should be minted on SM side");

        // Simulate ACK
        _simulateBridgeAck(true, transferId);

        // Check escrow released (burned, so balance should decrease)
        escrowed = pmBridge.getEscrowedBalance(token, user);
        assertEq(escrowed, 0, "Escrow should be released after ACK");
    }

    function test_bridgeTokens_smToPm() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        // Record logs to capture transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(smBridge), BRIDGE_AMOUNT);
        smBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Get transfer ID from event
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        bytes32 bridgeInitiatedSig = keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == bridgeInitiatedSig) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }
        assertTrue(transferId != bytes32(0), "Transfer ID should be captured");

        // Check escrow
        uint256 escrowed = smBridge.getEscrowedBalance(token, user);
        assertEq(escrowed, BRIDGE_AMOUNT, "Tokens should be escrowed");

        // Simulate remote side receiving message
        _simulateBridgeMessage(false, transferId, token, user, BRIDGE_AMOUNT);

        // Check tokens minted on PM side
        uint256 pmBalance = BridgeableToken(token).balanceOf(user);
        assertEq(pmBalance, BRIDGE_AMOUNT, "Tokens should be minted on PM side");

        // Simulate ACK
        _simulateBridgeAck(false, transferId);

        // Check escrow released
        escrowed = smBridge.getEscrowedBalance(token, user);
        assertEq(escrowed, 0, "Escrow should be released after ACK");
    }

    function test_bridgeTokens_notAcknowledged_reverts() public {
        // Create token pair but don't acknowledge
        pmBridge.createTokenPair(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, TOKEN_SALT);

        bytes memory bytecode = abi.encodePacked(
            type(BridgeableToken).creationCode,
            abi.encode(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, address(pmBridge))
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        address token = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(pmBridge),
                            TOKEN_SALT,
                            bytecodeHash
                        )
                    )
                )
            )
        );

        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        vm.expectRevert(TokenBridge.TokenPairNotAcknowledged.selector);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();
    }

    function test_bridgeTokens_tokenNotFound_reverts() public {
        address fakeToken = address(0x999);

        vm.startPrank(user);
        vm.expectRevert(TokenBridge.TokenPairNotFound.selector);
        pmBridge.bridgeTokens(fakeToken, BRIDGE_AMOUNT);
        vm.stopPrank();
    }

    function test_bridgeTokens_insufficientBalance_reverts() public {
        address token = _createTokenPair();
        // Don't mint tokens to user

        vm.startPrank(user);
        vm.expectRevert();
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();
    }

    // ============ ACK Tests ============

    function test_bridgeAck_completesTransfer() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Get transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)")) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }

        // Simulate remote side receiving message
        _simulateBridgeMessage(true, transferId, token, user, BRIDGE_AMOUNT);

        // Check transfer status before ACK
        TokenBridgeTypes.BridgeTransfer memory transferBefore = pmBridge.getBridgeTransfer(transferId);
        assertTrue(
            transferBefore.status == TokenBridgeTypes.BridgeStatus.Pending
                || transferBefore.status == TokenBridgeTypes.BridgeStatus.Completed,
            "Transfer should be pending or completed"
        );

        // Simulate ACK
        _simulateBridgeAck(true, transferId);

        // Check transfer status after ACK
        TokenBridgeTypes.BridgeTransfer memory transferAfter = pmBridge.getBridgeTransfer(transferId);
        assertTrue(
            transferAfter.status == TokenBridgeTypes.BridgeStatus.Completed,
            "Transfer should be completed"
        );
    }

    // ============ Retry Tests ============

    function test_retryBridge() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Get transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)")) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }

        // Mark as failed
        pmBridge.markTransferFailed(transferId);

        // Retry
        pmBridge.retryBridge(transferId);

        TokenBridgeTypes.BridgeTransfer memory transfer = pmBridge.getBridgeTransfer(transferId);
        assertTrue(
            transfer.status == TokenBridgeTypes.BridgeStatus.Retrying,
            "Transfer should be retrying"
        );
        assertEq(transfer.retryCount, 1, "Retry count should be 1");
    }

    function test_retryBridge_notFailed_reverts() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Get transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)")) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }

        vm.expectRevert(TokenBridge.TransferNotFailed.selector);
        pmBridge.retryBridge(transferId);
    }

    function test_refundFailedTransfer() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        uint256 initialBalance = IERC20(token).balanceOf(user);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Get transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)")) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }

        // Mark as failed
        pmBridge.markTransferFailed(transferId);

        // Refund
        pmBridge.refundFailedTransfer(transferId);

        uint256 finalBalance = IERC20(token).balanceOf(user);
        assertEq(finalBalance, initialBalance, "Tokens should be refunded");
    }

    // ============ Timeout Tests ============

    function test_markTransferFailed_timeout() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Get transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)")) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }

        // Fast forward time
        vm.warp(block.timestamp + 1 hours + 1);

        // Mark as failed
        pmBridge.markTransferFailed(transferId);

        TokenBridgeTypes.BridgeTransfer memory transfer = pmBridge.getBridgeTransfer(transferId);
        assertTrue(transfer.status == TokenBridgeTypes.BridgeStatus.Failed, "Transfer should be failed");
    }

    function test_markTransferFailed_notTimedOut_reverts() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        // Get transfer ID
        vm.recordLogs();
        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferId;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("BridgeInitiated(bytes32,address,address,uint256,bool)")) {
                transferId = bytes32(logs[i].topics[1]);
                break;
            }
        }

        vm.expectRevert(TokenBridge.TransferNotTimedOut.selector);
        pmBridge.markTransferFailed(transferId);
    }

    // ============ View Function Tests ============

    function test_getTokenPair() public {
        address token = _createTokenPair();

        TokenBridgeTypes.TokenPair memory pair = pmBridge.getTokenPair(token);
        assertTrue(pair.exists, "Token pair should exist");
        assertTrue(pair.acknowledged, "Token pair should be acknowledged");
    }

    function test_getEscrowedBalance() public {
        address token = _createTokenPair();
        _mintTokensToUser(token, user, INITIAL_SUPPLY);

        vm.startPrank(user);
        IERC20(token).approve(address(pmBridge), BRIDGE_AMOUNT);
        pmBridge.bridgeTokens(token, BRIDGE_AMOUNT);
        vm.stopPrank();

        uint256 escrowed = pmBridge.getEscrowedBalance(token, user);
        assertEq(escrowed, BRIDGE_AMOUNT, "Escrowed balance should match");
    }
}

