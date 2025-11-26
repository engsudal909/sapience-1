// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/predictionMarket/PredictionMarket.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "./MockERC20.sol";
import "./MockResolver.sol";

/**
 * @title PredictionMarketLimitOrderTest
 * @notice Comprehensive test suite for PredictionMarket limit order functionality
 */
contract PredictionMarketLimitOrderTest is Test {
    PredictionMarket public predictionMarket;
    MockERC20 public collateralToken;
    MockResolver public mockResolver;
    
    address public requester;
    address public responder;
    address public unauthorizedUser;
    
    uint256 public constant MIN_COLLATERAL = 1000e18;
    uint256 public constant REQUESTER_COLLATERAL = 2000e18;
    uint256 public constant RESPONDER_COLLATERAL = 1500e18;
    
    bytes32 public constant ORDER_REF_CODE = keccak256("order-ref-code");
    bytes32 public constant FILL_REF_CODE = keccak256("fill-ref-code");
    bytes public constant ENCODED_OUTCOMES = abi.encode("test-outcomes");
    
    // Events
    event OrderPlaced(
        address indexed requester,
        uint256 indexed orderId,
        bytes encodedPredictedOutcomes,
        address resolver,
        uint256 requesterCollateral,
        uint256 responderCollateral,
        bytes32 refCode
    );
    
    event OrderFilled(
        uint256 indexed orderId,
        address indexed requester,
        address indexed responder,
        bytes encodedPredictedOutcomes,
        uint256 requesterCollateral,
        uint256 responderCollateral,
        bytes32 refCode
    );
    
    event OrderCancelled(
        uint256 indexed orderId,
        address indexed requester,
        bytes encodedPredictedOutcomes,
        uint256 requesterCollateral,
        uint256 responderCollateral
    );

    function setUp() public {
        // Deploy mock contracts
        collateralToken = new MockERC20("Test Token", "TEST", 18);
        mockResolver = new MockResolver();
        
        // Create test accounts with known private keys
        requester = vm.addr(1);
        responder = vm.addr(2);
        unauthorizedUser = vm.addr(3);
        
        // Deploy prediction market
        predictionMarket = new PredictionMarket(
            "Prediction Market",
            "PM",
            address(collateralToken),
            MIN_COLLATERAL
        );
        
        // Mint tokens to test accounts
        collateralToken.mint(requester, 10000e18);
        collateralToken.mint(responder, 10000e18);
        collateralToken.mint(unauthorizedUser, 10000e18);
        
        // Approve prediction market to spend tokens
        vm.prank(requester);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        vm.prank(responder);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        vm.prank(unauthorizedUser);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
    }

    function _createValidOrderRequest() internal view returns (IPredictionStructs.OrderRequestData memory) {
        return IPredictionStructs.OrderRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            orderDeadline: block.timestamp + 1 hours,
            resolver: address(mockResolver),
            requesterCollateral: REQUESTER_COLLATERAL,
            responderCollateral: RESPONDER_COLLATERAL,
            refCode: ORDER_REF_CODE
        });
    }

    // ============ Place Order Tests ============
    
    function test_placeOrder_success() public {
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        
        uint256 requesterBalanceBefore = collateralToken.balanceOf(requester);
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        vm.expectEmit(true, true, false, true);
        emit OrderPlaced(
            requester,
            1, // orderId
            ENCODED_OUTCOMES,
            address(mockResolver),
            REQUESTER_COLLATERAL,
            RESPONDER_COLLATERAL,
            ORDER_REF_CODE
        );
        
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Verify order ID
        assertEq(orderId, 1);
        
        // Verify collateral transfer
        assertEq(collateralToken.balanceOf(requester), requesterBalanceBefore - REQUESTER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore + REQUESTER_COLLATERAL);
        
        // Verify order data
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, orderId);
        assertEq(order.encodedPredictedOutcomes, ENCODED_OUTCOMES);
        assertEq(order.resolver, address(mockResolver));
        assertEq(order.requesterCollateral, REQUESTER_COLLATERAL);
        assertEq(order.responderCollateral, RESPONDER_COLLATERAL);
        assertEq(order.requester, requester);
        assertEq(order.responder, address(0));
        assertEq(order.orderDeadline, block.timestamp + 1 hours);
        
        // Verify order tracking
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 1);
        assertEq(orderIds[0], orderId);
        
        uint256[] memory requesterOrders = predictionMarket.getUnfilledOrderByRequester(requester);
        assertEq(requesterOrders.length, 1);
        assertEq(requesterOrders[0], orderId);
        
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
    }
    
    function test_placeOrder_requesterCollateralZero() public {
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        orderRequest.requesterCollateral = 0;
        
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.RequesterCollateralMustBeGreaterThanZero.selector);
        predictionMarket.placeOrder(orderRequest);
    }
    
    function test_placeOrder_responderCollateralZero() public {
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        orderRequest.responderCollateral = 0;
        
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.ResponderCollateralMustBeGreaterThanZero.selector);
        predictionMarket.placeOrder(orderRequest);
    }
    
    function test_placeOrder_insufficientBalance() public {
        // Create an account with insufficient balance
        address poorRequester = vm.addr(5);
        collateralToken.mint(poorRequester, REQUESTER_COLLATERAL - 1); // Less than required
        vm.prank(poorRequester);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        
        vm.prank(poorRequester);
        vm.expectRevert(); // ERC20 transfer will fail
        predictionMarket.placeOrder(orderRequest);
    }
    
    function test_placeOrder_multipleOrders() public {
        // Place first order
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        // Place second order
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        // Verify both orders exist
        assertEq(orderId1, 1);
        assertEq(orderId2, 2);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 2);
        
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 2);
        assertEq(orderIds[0], 1);
        assertEq(orderIds[1], 2);
        
        uint256[] memory requesterOrders = predictionMarket.getUnfilledOrderByRequester(requester);
        assertEq(requesterOrders.length, 2);
        assertEq(requesterOrders[0], 1);
        assertEq(requesterOrders[1], 2);
    }

    // ============ Fill Order Tests ============
    
    function test_fillOrder_success() public {
        // First place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        uint256 responderBalanceBefore = collateralToken.balanceOf(responder);
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        vm.expectEmit(true, true, true, true);
        emit OrderFilled(
            orderId,
            requester,
            responder,
            ENCODED_OUTCOMES,
            REQUESTER_COLLATERAL,
            RESPONDER_COLLATERAL,
            FILL_REF_CODE
        );
        
        vm.prank(responder);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        // Verify collateral transfer
        assertEq(collateralToken.balanceOf(responder), responderBalanceBefore - RESPONDER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore + RESPONDER_COLLATERAL);
        
        // Verify order is marked as filled (orderId set to 0)
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, 0);
        
        // Verify prediction was created
        uint256[] memory requesterPredictions = predictionMarket.getOwnedPredictions(requester);
        uint256[] memory responderPredictions = predictionMarket.getOwnedPredictions(responder);
        assertEq(requesterPredictions.length, 1);
        assertEq(responderPredictions.length, 1);
        
        // Verify NFTs were minted
        assertEq(predictionMarket.ownerOf(requesterPredictions[0]), requester);
        assertEq(predictionMarket.ownerOf(responderPredictions[0]), responder);
    }
    
    function test_fillOrder_orderNotFound() public {
        // Create a non-existent order ID by using a very high number
        // that won't be treated as expired (deadline would be 0)
        vm.prank(responder);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.fillOrder(type(uint256).max, FILL_REF_CODE);
    }
    
    function test_fillOrder_orderExpired() public {
        // Place an order with expired deadline
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        orderRequest.orderDeadline = block.timestamp - 1; // Expired
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        vm.prank(responder);
        vm.expectRevert(PredictionMarket.OrderExpired.selector);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }
    
    function test_fillOrder_insufficientTakerBalance() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Create a responder with insufficient balance
        address poorResponder = vm.addr(6);
        collateralToken.mint(poorResponder, RESPONDER_COLLATERAL - 1); // Less than required
        vm.prank(poorResponder);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        vm.prank(poorResponder);
        vm.expectRevert(); // ERC20 transfer will fail
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }
    
    function test_fillOrder_alreadyFilled() public {
        // Place and fill an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        vm.prank(responder);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        // Try to fill the same order again
        vm.prank(responder);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }
    
    function test_fillOrder_invalidMarketsAccordingToResolver() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Make resolver return invalid
        mockResolver.setValidationResult(false, IPredictionMarketResolver.Error.INVALID_MARKET);
        
        vm.prank(responder);
        vm.expectRevert(PredictionMarket.InvalidMarketsAccordingToResolver.selector);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }

    // ============ Cancel Order Tests ============
    
    function test_cancelOrder_success() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Fast forward past the deadline
        vm.warp(block.timestamp + 2 hours);
        
        uint256 requesterBalanceBefore = collateralToken.balanceOf(requester);
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        vm.expectEmit(true, true, false, true);
        emit OrderCancelled(
            orderId,
            requester,
            ENCODED_OUTCOMES,
            REQUESTER_COLLATERAL,
            RESPONDER_COLLATERAL
        );
        
        vm.prank(requester);
        predictionMarket.cancelOrder(orderId);
        
        // Verify collateral refund
        assertEq(collateralToken.balanceOf(requester), requesterBalanceBefore + REQUESTER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore - REQUESTER_COLLATERAL);
        
        // Verify order is removed from tracking
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0);
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 0);
        
        uint256[] memory requesterOrders = predictionMarket.getUnfilledOrderByRequester(requester);
        assertEq(requesterOrders.length, 0);
        
        // Verify order is marked as cancelled (orderId set to 0)
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, 0);
    }
    
    function test_cancelOrder_orderNotFound() public {
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.cancelOrder(999);
    }
    
    function test_cancelOrder_beforeExpiration() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Cancel before deadline - should succeed
        uint256 requesterBalanceBefore = collateralToken.balanceOf(requester);
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        vm.expectEmit(true, true, false, true);
        emit OrderCancelled(
            orderId,
            requester,
            ENCODED_OUTCOMES,
            REQUESTER_COLLATERAL,
            RESPONDER_COLLATERAL
        );
        
        vm.prank(requester);
        predictionMarket.cancelOrder(orderId);
        
        // Verify collateral refund
        assertEq(collateralToken.balanceOf(requester), requesterBalanceBefore + REQUESTER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore - REQUESTER_COLLATERAL);
        
        // Verify order is removed from tracking
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0);
    }
    
    function test_cancelOrder_alreadyFilled() public {
        // Place and fill an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        vm.prank(responder);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        // Try to cancel the filled order
        vm.warp(block.timestamp + 2 hours);
        vm.prank(requester);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.cancelOrder(orderId);
    }

    // ============ View Function Tests ============
    
    function test_getUnfilledOrder() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, orderId);
        assertEq(order.encodedPredictedOutcomes, ENCODED_OUTCOMES);
        assertEq(order.resolver, address(mockResolver));
        assertEq(order.requesterCollateral, REQUESTER_COLLATERAL);
        assertEq(order.responderCollateral, RESPONDER_COLLATERAL);
        assertEq(order.requester, requester);
        assertEq(order.responder, address(0));
        assertEq(order.orderDeadline, block.timestamp + 1 hours);
    }
    
    function test_getUnfilledOrderIds() public {
        // Initially no orders
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 0);
        
        // Place multiple orders
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 2);
        assertEq(orderIds[0], orderId1);
        assertEq(orderIds[1], orderId2);
    }
    
    function test_getUnfilledOrdersCount() public {
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0);
        
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        predictionMarket.placeOrder(orderRequest);
        
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
        
        vm.prank(requester);
        predictionMarket.placeOrder(orderRequest);
        
        assertEq(predictionMarket.getUnfilledOrdersCount(), 2);
    }
    
    function test_getUnfilledOrderByRequester() public {
        // Initially no orders
        uint256[] memory requesterOrders = predictionMarket.getUnfilledOrderByRequester(requester);
        assertEq(requesterOrders.length, 0);
        
        // Place orders
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        requesterOrders = predictionMarket.getUnfilledOrderByRequester(requester);
        assertEq(requesterOrders.length, 2);
        assertEq(requesterOrders[0], orderId1);
        assertEq(requesterOrders[1], orderId2);
        
        // Check another requester has no orders
        uint256[] memory otherRequesterOrders = predictionMarket.getUnfilledOrderByRequester(responder);
        assertEq(otherRequesterOrders.length, 0);
    }

    // ============ Integration Tests ============
    
    function test_orderLifecycle_placeFillCancel() public {
        // Test complete order lifecycle
        
        // 1. Place order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
        
        // 2. Fill order
        vm.prank(responder);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0); // Order removed from count
        
        // 3. Verify prediction was created
        uint256[] memory requesterPredictions = predictionMarket.getOwnedPredictions(requester);
        uint256[] memory responderPredictions = predictionMarket.getOwnedPredictions(responder);
        assertEq(requesterPredictions.length, 1);
        assertEq(responderPredictions.length, 1);
    }
    
    function test_orderLifecycle_placeCancel() public {
        // Test order placement and cancellation
        
        // 1. Place order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
        
        // 2. Fast forward past deadline
        vm.warp(block.timestamp + 2 hours);
        
        // 3. Cancel order
        vm.prank(requester);
        predictionMarket.cancelOrder(orderId);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0);
        
        // 4. Verify no predictions were created
        uint256[] memory requesterPredictions = predictionMarket.getOwnedPredictions(requester);
        uint256[] memory responderPredictions = predictionMarket.getOwnedPredictions(responder);
        assertEq(requesterPredictions.length, 0);
        assertEq(responderPredictions.length, 0);
    }
    
    function test_multipleMakersOrders() public {
        // Test orders from multiple requesters
        
        // Setup second requester
        address requester2 = vm.addr(4);
        collateralToken.mint(requester2, 10000e18);
        vm.prank(requester2);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        // Place orders from both requesters
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(requester2);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        // Verify both orders exist
        assertEq(predictionMarket.getUnfilledOrdersCount(), 2);
        
        uint256[] memory allOrders = predictionMarket.getUnfilledOrderIds();
        assertEq(allOrders.length, 2);
        
        uint256[] memory requester1Orders = predictionMarket.getUnfilledOrderByRequester(requester);
        assertEq(requester1Orders.length, 1);
        assertEq(requester1Orders[0], orderId1);
        
        uint256[] memory requester2Orders = predictionMarket.getUnfilledOrderByRequester(requester2);
        assertEq(requester2Orders.length, 1);
        assertEq(requester2Orders[0], orderId2);
    }

    // ============ Edge Cases and Error Conditions ============
    
    function test_fillOrder_withDifferentRefCode() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        bytes32 differentRefCode = keccak256("different-fill-ref-code");
        
        vm.expectEmit(true, true, true, true);
        emit OrderFilled(
            orderId,
            requester,
            responder,
            ENCODED_OUTCOMES,
            REQUESTER_COLLATERAL,
            RESPONDER_COLLATERAL,
            differentRefCode
        );
        
        vm.prank(responder);
        predictionMarket.fillOrder(orderId, differentRefCode);
    }
    
    function test_orderIdCounterIncrement() public {
        // Verify order ID counter increments correctly
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        
        vm.prank(requester);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest);
        assertEq(orderId1, 1);
        
        vm.prank(requester);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest);
        assertEq(orderId2, 2);
        
        vm.prank(requester);
        uint256 orderId3 = predictionMarket.placeOrder(orderRequest);
        assertEq(orderId3, 3);
    }
    
    function test_collateralTrackingAfterOrderOperations() public {
        // Test collateral tracking through order operations
        
        // Initial state
        assertEq(predictionMarket.getUserCollateralDeposits(requester), 0);
        assertEq(predictionMarket.getUserCollateralDeposits(responder), 0);
        
        // Place order (should not affect user collateral deposits)
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(requester);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        assertEq(predictionMarket.getUserCollateralDeposits(requester), 0);
        assertEq(predictionMarket.getUserCollateralDeposits(responder), 0);
        
        // Fill order (should create prediction and track collateral)
        vm.prank(responder);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        assertEq(predictionMarket.getUserCollateralDeposits(requester), REQUESTER_COLLATERAL);
        assertEq(predictionMarket.getUserCollateralDeposits(responder), RESPONDER_COLLATERAL);
    }
}
