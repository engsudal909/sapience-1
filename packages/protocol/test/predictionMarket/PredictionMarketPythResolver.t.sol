// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../../src/predictionMarket/resolvers/PredictionMarketPythResolver.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/predictionMarket/resolvers/pyth/IPyth.sol";
import "../../src/predictionMarket/resolvers/pyth/PythStructs.sol";

contract MockPyth is IPyth {
    using PythStructs for PythStructs.Price;

    error PriceFeedNotFoundWithinRange();

    uint256 public fee;

    struct Update {
        bytes32 id;
        int64 price;
        uint64 conf;
        int32 expo;
        uint64 publishTime;
    }

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256 feeAmount) {
        return fee;
    }

    function parsePriceFeedUpdates(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory priceFeeds) {
        require(msg.value >= fee, "fee");
        require(updateData.length > 0, "no update");

        Update memory u = abi.decode(updateData[0], (Update));

        // Enforce publishTime window
        if (u.publishTime < minPublishTime || u.publishTime > maxPublishTime) {
            revert PriceFeedNotFoundWithinRange();
        }

        priceFeeds = new PythStructs.PriceFeed[](priceIds.length);
        for (uint256 i = 0; i < priceIds.length; i++) {
            require(priceIds[i] == u.id, "id mismatch");
            priceFeeds[i].id = u.id;
            priceFeeds[i].price = PythStructs.Price({
                price: u.price,
                conf: u.conf,
                expo: u.expo,
                publishTime: u.publishTime
            });
            priceFeeds[i].emaPrice = priceFeeds[i].price;
        }
    }
}

contract PredictionMarketPythResolverTest is Test {
    PredictionMarketPythResolver resolver;
    MockPyth mockPyth;

    uint256 constant MAX_MARKETS = 10;

    function setUp() public {
        vm.warp(1000);
        mockPyth = new MockPyth();
        mockPyth.setFee(0);

        PredictionMarketPythResolver.Settings memory settings = PredictionMarketPythResolver.Settings({
            maxPredictionMarkets: MAX_MARKETS,
            pyth: IPyth(address(mockPyth)),
            publishTimeWindowSeconds: 0
        });

        resolver = new PredictionMarketPythResolver(settings);
    }

    function _encodeOutcome(
        bytes32 priceId,
        uint64 endTime,
        int64 strikePrice,
        int32 strikeExpo,
        bool overWinsOnTie,
        bool prediction
    ) internal pure returns (bytes memory) {
        PredictionMarketPythResolver.BinaryOptionOutcome[]
            memory outcomes = new PredictionMarketPythResolver.BinaryOptionOutcome[](1);
        outcomes[0] = PredictionMarketPythResolver.BinaryOptionOutcome({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strikePrice,
            strikeExpo: strikeExpo,
            overWinsOnTie: overWinsOnTie,
            prediction: prediction
        });
        return abi.encode(outcomes);
    }

    function _updateData(
        bytes32 priceId,
        int64 price,
        int32 expo,
        uint64 publishTime
    ) internal pure returns (bytes[] memory updateData) {
        MockPyth.Update memory u = MockPyth.Update({
            id: priceId,
            price: price,
            conf: 0,
            expo: expo,
            publishTime: publishTime
        });
        updateData = new bytes[](1);
        updateData[0] = abi.encode(u);
    }

    function test_validatePredictionMarkets_success() public view {
        bytes32 priceId = keccak256("BTC-USD");
        bytes memory encoded = _encodeOutcome(priceId, 2000, 100, -8, true, true);

        (bool isValid, IPredictionMarketResolver.Error err) = resolver.validatePredictionMarkets(encoded);
        assertTrue(isValid);
        assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }

    function test_validatePredictionMarkets_invalidPriceId() public view {
        bytes memory encoded = _encodeOutcome(bytes32(0), 2000, 100, -8, true, true);

        (bool isValid, IPredictionMarketResolver.Error err) = resolver.validatePredictionMarkets(encoded);
        assertFalse(isValid);
        assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.INVALID_MARKET));
    }

    function test_validatePredictionMarkets_marketNotOpened() public {
        vm.warp(3000);
        bytes32 priceId = keccak256("BTC-USD");
        bytes memory encoded = _encodeOutcome(priceId, 2000, 100, -8, true, true);

        (bool isValid, IPredictionMarketResolver.Error err) = resolver.validatePredictionMarkets(encoded);
        assertFalse(isValid);
        assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.MARKET_NOT_OPENED));
    }

    function test_getPredictionResolution_unsettled() public view {
        bytes32 priceId = keccak256("BTC-USD");
        bytes memory encoded = _encodeOutcome(priceId, 2000, 100, -8, true, true);

        (bool isResolved, IPredictionMarketResolver.Error err, bool parlaySuccess) = resolver.getPredictionResolution(
            encoded
        );
        assertFalse(isResolved);
        assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED));
        assertTrue(parlaySuccess);
    }

    function test_settleMarket_andResolve_overWins() public {
        bytes32 priceId = keccak256("BTC-USD");
        uint64 endTime = 2000;
        int32 expo = -8;
        int64 strike = 100;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, 150, expo, endTime);
        PredictionMarketPythResolver.BinaryOptionMarket memory market = PredictionMarketPythResolver.BinaryOptionMarket({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strike,
            strikeExpo: expo,
            overWinsOnTie: true
        });

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertTrue(resolvedToOver);

        // Maker predicts over -> win
        {
            bytes memory encodedWin = _encodeOutcome(priceId, endTime, strike, expo, true, true);
            (bool isResolved, IPredictionMarketResolver.Error err, bool parlaySuccess) = resolver
                .getPredictionResolution(encodedWin);
            assertTrue(isResolved);
            assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.NO_ERROR));
            assertTrue(parlaySuccess);
        }

        // Maker predicts under -> lose
        {
            bytes memory encodedLose = _encodeOutcome(priceId, endTime, strike, expo, true, false);
            (bool isResolved, IPredictionMarketResolver.Error err, bool parlaySuccess) = resolver
                .getPredictionResolution(encodedLose);
            assertTrue(isResolved);
            assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.NO_ERROR));
            assertFalse(parlaySuccess);
        }
    }

    function test_settleMarket_storesSettlementFields() public {
        bytes32 priceId = keccak256("BTC-USD");
        uint64 endTime = 2000;
        int32 expo = -8;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, 150, expo, endTime);
        PredictionMarketPythResolver.BinaryOptionMarket memory market = PredictionMarketPythResolver.BinaryOptionMarket({
            priceId: priceId,
            endTime: endTime,
            strikePrice: 100,
            strikeExpo: expo,
            overWinsOnTie: true
        });

        (bytes32 marketId, ) = resolver.settleMarket(market, updateData);

        // Keep locals small to avoid stack-too-deep in tests
        (bool settled, bool storedOutcome, int64 storedPrice, int32 storedExpo, uint64 publishTime) = resolver
            .settlements(marketId);
        assertTrue(settled);
        assertTrue(storedOutcome);
        assertEq(storedPrice, 150);
        assertEq(storedExpo, expo);
        assertEq(publishTime, endTime);
    }

    function test_tieBehavior_overWinsOnTie_true() public {
        bytes32 priceId = keccak256("ETH-USD");
        uint64 endTime = 2000;
        int32 expo = -8;
        int64 strike = 100;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, strike, expo, endTime); // price == strike
        PredictionMarketPythResolver.BinaryOptionMarket memory market = PredictionMarketPythResolver.BinaryOptionMarket({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strike,
            strikeExpo: expo,
            overWinsOnTie: true
        });

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertTrue(resolvedToOver);

        // Maker predicts over should win
        bytes memory encoded = _encodeOutcome(priceId, endTime, strike, expo, true, true);
        (, , bool parlaySuccess) = resolver.getPredictionResolution(encoded);
        assertTrue(parlaySuccess);
    }

    function test_tieBehavior_overWinsOnTie_false() public {
        bytes32 priceId = keccak256("SOL-USD");
        uint64 endTime = 2000;
        int32 expo = -8;
        int64 strike = 100;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, strike, expo, endTime); // price == strike
        PredictionMarketPythResolver.BinaryOptionMarket memory market = PredictionMarketPythResolver.BinaryOptionMarket({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strike,
            strikeExpo: expo,
            overWinsOnTie: false
        });

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertFalse(resolvedToOver);

        // Maker predicts over should lose
        bytes memory encoded = _encodeOutcome(priceId, endTime, strike, expo, false, true);
        (, , bool parlaySuccess) = resolver.getPredictionResolution(encoded);
        assertFalse(parlaySuccess);
    }

    function test_settleMarket_revertOnExpoMismatch() public {
        bytes32 priceId = keccak256("BTC-USD");
        uint64 endTime = 2000;

        vm.warp(endTime);

        bytes[] memory updateData = _updateData(priceId, 150, -8, endTime);
        PredictionMarketPythResolver.BinaryOptionMarket memory market = PredictionMarketPythResolver.BinaryOptionMarket({
            priceId: priceId,
            endTime: endTime,
            strikePrice: 100,
            strikeExpo: -6,
            overWinsOnTie: true
        });

        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketPythResolver.StrikeExpoMismatch.selector,
                int32(-6),
                int32(-8)
            )
        );
        resolver.settleMarket(market, updateData);
    }

    function test_settleMarket_revertIfPublishTimeOutOfRange() public {
        bytes32 priceId = keccak256("BTC-USD");
        uint64 endTime = 2000;
        int32 expo = -8;

        vm.warp(endTime);

        // publishTime doesn't match endTime, and window=0 => should revert
        bytes[] memory updateData = _updateData(priceId, 150, expo, endTime + 1);
        PredictionMarketPythResolver.BinaryOptionMarket memory market = PredictionMarketPythResolver.BinaryOptionMarket({
            priceId: priceId,
            endTime: endTime,
            strikePrice: 100,
            strikeExpo: expo,
            overWinsOnTie: true
        });

        vm.expectRevert(MockPyth.PriceFeedNotFoundWithinRange.selector);
        resolver.settleMarket(market, updateData);
    }
}


