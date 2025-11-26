// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/predictionMarket/PredictionMarket.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/vault/PassiveLiquidityVault.sol";
import "../../src/vault/interfaces/IPassiveLiquidityVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./MockERC20.sol";
import "./MockResolver.sol";

/**
 * @title PredictionMarketTransferRestrictionsTest
 * @notice Test suite for NFT transfer restrictions in PredictionMarket contract
 * @dev Tests that NFTs cannot be transferred to PassiveLiquidityVault contracts
 */
contract PredictionMarketTransferRestrictionsTest is Test {
    PredictionMarket public predictionMarket;
    MockERC20 public collateralToken;
    MockResolver public mockResolver;
    PassiveLiquidityVault public vault;
    
    address public requester;
    address public responder;
    address public eoaUser;
    
    uint256 public constant MIN_COLLATERAL = 1000e18;
    uint256 public constant REQUESTER_COLLATERAL = 2000e18;
    uint256 public constant RESPONDER_COLLATERAL = 1500e18;
    
    bytes32 public constant REF_CODE = keccak256("test-ref-code");
    bytes public constant ENCODED_OUTCOMES = abi.encode("test-outcomes");
    
    uint256 public requesterNftTokenId;
    uint256 public responderNftTokenId;

    // Mock contract that implements ERC165 but not IPassiveLiquidityVault
    MockGenericContract public genericContract;
    
    // Mock contract that implements IPassiveLiquidityVault interface
    MockPassiveLiquidityVault public mockVault;

    function setUp() public {
        // Deploy mock contracts
        collateralToken = new MockERC20("Test Token", "TEST", 18);
        mockResolver = new MockResolver();
        
        // Create test accounts
        requester = vm.addr(1);
        responder = vm.addr(2);
        eoaUser = vm.addr(3);
        
        // Deploy prediction market
        predictionMarket = new PredictionMarket(
            "Prediction Market",
            "PM",
            address(collateralToken),
            MIN_COLLATERAL
        );
        
        // Deploy PassiveLiquidityVault
        vault = new PassiveLiquidityVault(
            address(collateralToken),
            vm.addr(4), // manager
            "Test Vault",
            "TV"
        );
        
        // Deploy mock contracts
        genericContract = new MockGenericContract();
        mockVault = new MockPassiveLiquidityVault();
        
        // Mint tokens to test accounts
        collateralToken.mint(requester, 10000e18);
        collateralToken.mint(responder, 10000e18);
        collateralToken.mint(eoaUser, 10000e18);
        
        // Approve prediction market to spend tokens
        vm.prank(requester);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        vm.prank(responder);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        // Create a prediction to get NFTs for testing
        IPredictionStructs.MintPredictionRequestData memory request = _createValidMintRequest();
        vm.prank(requester);
        (requesterNftTokenId, responderNftTokenId) = predictionMarket.mint(request);
    }

    function _createValidMintRequest() internal view returns (IPredictionStructs.MintPredictionRequestData memory) {
        // Create the message hash that will be signed
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                RESPONDER_COLLATERAL,
                REQUESTER_COLLATERAL,
                address(mockResolver),
                requester,
                block.timestamp + 1 hours,
                0 // requesterNonce
            )
        );
        
        // Get the EIP-712 approval hash that needs to be signed
        bytes32 approvalHash = predictionMarket.getApprovalHash(messageHash, responder);
        
        // Sign the approval hash with the responder's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, approvalHash); // Use key 2 for responder
        bytes memory responderSignature = abi.encodePacked(r, s, v);
        
        return IPredictionStructs.MintPredictionRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            resolver: address(mockResolver),
            requesterCollateral: REQUESTER_COLLATERAL,
            responderCollateral: RESPONDER_COLLATERAL,
            requester: requester,
            responder: responder,
            requesterNonce: 0,
            responderSignature: responderSignature,
            responderDeadline: block.timestamp + 1 hours,
            refCode: REF_CODE
        });
    }

    // ============ Successful Transfer Tests ============

    function test_transferMakerNft_toEOA_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
        
        // Transfer to EOA
        vm.prank(requester);
        predictionMarket.transferFrom(requester, eoaUser, requesterNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), eoaUser);
        
        // Verify prediction requester was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(requesterNftTokenId);
        assertEq(prediction.requester, eoaUser);
    }

    function test_transferTakerNft_toEOA_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
        
        // Transfer to EOA
        vm.prank(responder);
        predictionMarket.transferFrom(responder, eoaUser, responderNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(responderNftTokenId), eoaUser);
        
        // Verify prediction responder was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(responderNftTokenId);
        assertEq(prediction.responder, eoaUser);
    }

    function test_transferMakerNft_toGenericContract_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
        
        // Transfer to generic contract
        vm.prank(requester);
        predictionMarket.transferFrom(requester, address(genericContract), requesterNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), address(genericContract));
        
        // Verify prediction requester was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(requesterNftTokenId);
        assertEq(prediction.requester, address(genericContract));
    }

    function test_transferTakerNft_toGenericContract_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
        
        // Transfer to generic contract
        vm.prank(responder);
        predictionMarket.transferFrom(responder, address(genericContract), responderNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(responderNftTokenId), address(genericContract));
        
        // Verify prediction responder was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(responderNftTokenId);
        assertEq(prediction.responder, address(genericContract));
    }

    function test_safeTransferMakerNft_toGenericContract_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
        
        // Safe transfer to generic contract
        vm.prank(requester);
        predictionMarket.safeTransferFrom(requester, address(genericContract), requesterNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), address(genericContract));
    }

    // ============ Failed Transfer Tests (to PassiveLiquidityVault) ============

    function test_transferMakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
        
        // Attempt transfer to PassiveLiquidityVault should revert
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(requester, address(vault), requesterNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
    }

    function test_transferTakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
        
        // Attempt transfer to PassiveLiquidityVault should revert
        vm.prank(responder);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(responder, address(vault), responderNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
    }

    function test_safeTransferMakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
        
        // Attempt safe transfer to PassiveLiquidityVault should revert
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.safeTransferFrom(requester, address(vault), requesterNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
    }

    function test_safeTransferTakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
        
        // Attempt safe transfer to PassiveLiquidityVault should revert
        vm.prank(responder);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.safeTransferFrom(responder, address(vault), responderNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
    }

    function test_safeTransferMakerNft_withData_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
        
        // Attempt safe transfer with data to PassiveLiquidityVault should revert
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.safeTransferFrom(requester, address(vault), requesterNftTokenId, "0x");
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
    }

    // ============ Mock Contract Tests ============

    function test_transferMakerNft_toMockVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
        
        // Attempt transfer to mock vault (implements IPassiveLiquidityVault) should revert
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(requester, address(mockVault), requesterNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(requesterNftTokenId), requester);
    }

    function test_transferTakerNft_toMockVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
        
        // Attempt transfer to mock vault (implements IPassiveLiquidityVault) should revert
        vm.prank(responder);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(responder, address(mockVault), responderNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(responderNftTokenId), responder);
    }

    // ============ Interface Detection Tests ============

    function test_passiveLiquidityVault_implementsCorrectInterface() public {
        // Verify that the vault implements IPassiveLiquidityVault interface
        assertTrue(vault.supportsInterface(type(IPassiveLiquidityVault).interfaceId));
    }

    function test_mockVault_implementsCorrectInterface() public {
        // Verify that the mock vault implements IPassiveLiquidityVault interface
        assertTrue(mockVault.supportsInterface(type(IPassiveLiquidityVault).interfaceId));
    }

    function test_genericContract_doesNotImplementVaultInterface() public {
        // Verify that the generic contract does not implement IPassiveLiquidityVault interface
        assertFalse(genericContract.supportsInterface(type(IPassiveLiquidityVault).interfaceId));
    }

    // ============ Edge Case Tests ============

    function test_transferToZeroAddress_revertsWithStandardERC721Error() public {
        // Transfer to zero address should revert with standard ERC721 error, not our custom error
        vm.prank(requester);
        vm.expectRevert(); // ERC721InvalidReceiver error
        predictionMarket.transferFrom(requester, address(0), requesterNftTokenId);
    }

    function test_transferFromZeroAddress_revertsWithStandardERC721Error() public {
        // Transfer from zero address should revert with standard ERC721 error, not our custom error
        vm.prank(requester);
        vm.expectRevert(); // ERC721InvalidSender error
        predictionMarket.transferFrom(address(0), requester, requesterNftTokenId);
    }

    function test_transferNonExistentToken_revertsWithStandardERC721Error() public {
        // Transfer non-existent token should revert with standard ERC721 error
        uint256 nonExistentTokenId = 999999;
        vm.prank(requester);
        vm.expectRevert(); // ERC721NonexistentToken error
        predictionMarket.transferFrom(requester, eoaUser, nonExistentTokenId);
    }

    function test_transferWithoutApproval_revertsWithStandardERC721Error() public {
        // Transfer without approval should revert with standard ERC721 error
        vm.prank(eoaUser); // Not the owner
        vm.expectRevert(); // ERC721InsufficientApproval error
        predictionMarket.transferFrom(requester, eoaUser, requesterNftTokenId);
    }
}

/**
 * @title MockGenericContract
 * @notice Mock contract that implements ERC165 but not IPassiveLiquidityVault
 */
contract MockGenericContract is ERC165, IERC721Receiver {
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return 
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
    
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

/**
 * @title MockPassiveLiquidityVault
 * @notice Mock contract that implements IPassiveLiquidityVault interface
 */
contract MockPassiveLiquidityVault is ERC165, IPassiveLiquidityVault {
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return 
            interfaceId == type(IPassiveLiquidityVault).interfaceId ||
            super.supportsInterface(interfaceId);
    }
    
    // Minimal implementation of IPassiveLiquidityVault interface functions
    function manager() external pure returns (address) { return address(0); }
    function expirationTime() external pure returns (uint256) { return 0; }
    function interactionDelay() external pure returns (uint256) { return 0; }
    function utilizationRate() external pure returns (uint256) { return 0; }
    function availableAssets() external pure returns (uint256) { return 0; }
    function totalDeployed() external pure returns (uint256) { return 0; }
    function emergencyMode() external pure returns (bool) { return false; }
    
    function requestDeposit(uint256 assets, uint256 expectedShares) external pure {}
    function requestWithdrawal(uint256 shares, uint256 expectedAssets) external pure {}
    function cancelWithdrawal() external pure {}
    function cancelDeposit() external pure {}
    function emergencyWithdraw(uint256 shares) external pure {}
    function processDeposit(address requestedBy) external pure {}
    function processWithdrawal(address requestedBy) external pure {}
    function batchProcessDeposit(address[] calldata) external pure {}
    function batchProcessWithdrawal(address[] calldata) external pure {}
    function approveFundsUsage(address protocol, uint256 amount) external pure {}
    function cleanInactiveProtocols() external pure {}
    function getActiveProtocolsCount() external pure returns (uint256) { return 0; }
    function getActiveProtocols() external pure returns (address[] memory) { return new address[](0); }
    function getActiveProtocol(uint256) external pure returns (address) { return address(0); }
    function getLockedShares(address) external view returns (uint256) { return 0; }
    function getAvailableShares(address) external view returns (uint256) { return 0; }
    function setManager(address) external pure {}
    function setMaxUtilizationRate(uint256) external pure {}
    function setExpirationTime(uint256) external pure {}
    function setInteractionDelay(uint256) external pure {}
    function toggleEmergencyMode() external pure {}
    function pause() external pure {}
    function unpause() external pure {}
    
    // IERC1271 function
    function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) { return 0xFFFFFFFF; }
}
