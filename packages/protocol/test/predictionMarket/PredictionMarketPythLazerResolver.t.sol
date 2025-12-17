// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/predictionMarket/resolvers/PredictionMarketPythLazerResolver.sol";
import "../../src/predictionMarket/resolvers/pythLazer/IPythLazer.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerLib.sol";

contract MockPythLazer is IPythLazer {
    uint256 public override verification_fee;

    function setFee(uint256 fee) external {
        verification_fee = fee;
    }

    function verifyUpdate(
        bytes calldata update
    ) external payable override returns (bytes memory payload, address signer) {
        require(msg.value >= verification_fee, "fee");
        if (msg.value > verification_fee) {
            payable(msg.sender).transfer(msg.value - verification_fee);
        }
        // In the real PythLazer contract, `update` contains signature + payload; verifyUpdate returns the payload slice.
        // For unit tests we treat `update` itself as the already-extracted payload bytes.
        payload = update;
        signer = address(1);
    }
}

contract PredictionMarketPythLazerResolverTest is Test {
    PredictionMarketPythLazerResolver resolver;
    MockPythLazer mock;

    uint256 constant MAX_MARKETS = 10;
    uint32 constant FEED_ID = 6;
    bytes32 constant PRICE_ID = bytes32(uint256(FEED_ID)); // feed id encoded in low 32 bits
    uint32 constant PAYLOAD_MAGIC = 2479346549;

    function setUp() public {
        vm.warp(1000);
        mock = new MockPythLazer();
        mock.setFee(0);

        PredictionMarketPythLazerResolver.Settings memory settings = PredictionMarketPythLazerResolver
            .Settings({maxPredictionMarkets: MAX_MARKETS, pythLazer: IPythLazer(address(mock)), publishTimeWindowSeconds: 0});
        resolver = new PredictionMarketPythLazerResolver(settings);
    }

    function _encodeOutcome(
        bytes32 priceId,
        uint64 endTime,
        int64 strikePrice,
        int32 strikeExpo,
        bool overWinsOnTie,
        bool prediction
    ) internal pure returns (bytes memory) {
        PredictionMarketPythLazerResolver.BinaryOptionOutcome[]
            memory outcomes = new PredictionMarketPythLazerResolver.BinaryOptionOutcome[](1);
        outcomes[0] = PredictionMarketPythLazerResolver.BinaryOptionOutcome({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strikePrice,
            strikeExpo: strikeExpo,
            overWinsOnTie: overWinsOnTie,
            prediction: prediction
        });
        return abi.encode(outcomes);
    }

    function _payload(
        uint64 timestamp,
        uint32 feedId,
        uint64 price,
        int16 expo
    ) internal pure returns (bytes memory payload) {
        payload = abi.encodePacked(
            bytes4(uint32(PAYLOAD_MAGIC)),
            bytes8(timestamp),
            bytes1(uint8(PythLazerLib.Channel.RealTime)),
            bytes1(uint8(1)), // feedsLen
            bytes4(feedId),
            bytes1(uint8(2)), // num properties
            bytes1(uint8(PythLazerLib.PriceFeedProperty.Price)),
            bytes8(price),
            bytes1(uint8(PythLazerLib.PriceFeedProperty.Exponent)),
            bytes2(uint16(expo))
        );
    }

    function _updateData(bytes memory payloadBytes) internal pure returns (bytes[] memory updateData) {
        updateData = new bytes[](1);
        updateData[0] = payloadBytes;
    }

    function test_validatePredictionMarkets_success() public view {
        bytes memory encoded = _encodeOutcome(PRICE_ID, 2000, 100, -8, true, true);
        (bool isValid, IPredictionMarketResolver.Error err) = resolver.validatePredictionMarkets(encoded);
        assertTrue(isValid);
        assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }

    function test_validatePredictionMarkets_invalidPriceIdFormat() public view {
        // High bits set => treated as invalid to avoid mixing with Pyth Core 32-byte ids.
        bytes32 invalid = bytes32(uint256(1) << 200);
        bytes memory encoded = _encodeOutcome(invalid, 2000, 100, -8, true, true);
        (bool isValid, IPredictionMarketResolver.Error err) = resolver.validatePredictionMarkets(encoded);
        assertFalse(isValid);
        assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.INVALID_MARKET));
    }

    function test_getPredictionResolution_unsettled() public view {
        bytes memory encoded = _encodeOutcome(PRICE_ID, 2000, 100, -8, true, true);
        (bool isResolved, IPredictionMarketResolver.Error err, bool parlaySuccess) = resolver
            .getPredictionResolution(encoded);
        assertFalse(isResolved);
        assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED));
        assertTrue(parlaySuccess);
    }

    function test_settleMarket_andResolve_overWins() public {
        uint64 endTime = 2000;
        int16 expo = -8;
        int64 strike = 100;
        vm.warp(endTime);

        bytes[] memory updateData = _updateData(_payload(endTime, FEED_ID, 150, expo));
        PredictionMarketPythLazerResolver.BinaryOptionMarket memory market = PredictionMarketPythLazerResolver
            .BinaryOptionMarket({priceId: PRICE_ID, endTime: endTime, strikePrice: strike, strikeExpo: int32(expo), overWinsOnTie: true});

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertTrue(resolvedToOver);

        // Maker predicts over -> win
        {
            bytes memory encodedWin = _encodeOutcome(PRICE_ID, endTime, strike, int32(expo), true, true);
            (bool isResolved, IPredictionMarketResolver.Error err, bool parlaySuccess) = resolver
                .getPredictionResolution(encodedWin);
            assertTrue(isResolved);
            assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.NO_ERROR));
            assertTrue(parlaySuccess);
        }

        // Maker predicts under -> lose
        {
            bytes memory encodedLose = _encodeOutcome(PRICE_ID, endTime, strike, int32(expo), true, false);
            (bool isResolved, IPredictionMarketResolver.Error err, bool parlaySuccess) = resolver
                .getPredictionResolution(encodedLose);
            assertTrue(isResolved);
            assertEq(uint256(err), uint256(IPredictionMarketResolver.Error.NO_ERROR));
            assertFalse(parlaySuccess);
        }
    }

    function test_settleMarket_storesSettlementFields() public {
        uint64 endTime = 2000;
        int16 expo = -8;
        vm.warp(endTime);

        bytes[] memory updateData = _updateData(_payload(endTime, FEED_ID, 150, expo));
        PredictionMarketPythLazerResolver.BinaryOptionMarket memory market = PredictionMarketPythLazerResolver
            .BinaryOptionMarket({priceId: PRICE_ID, endTime: endTime, strikePrice: 100, strikeExpo: int32(expo), overWinsOnTie: true});

        (bytes32 marketId, ) = resolver.settleMarket(market, updateData);

        (bool settled, bool storedOutcome, int64 storedPrice, int32 storedExpo, uint64 publishTime) = resolver
            .settlements(marketId);
        assertTrue(settled);
        assertTrue(storedOutcome);
        assertEq(storedPrice, 150);
        assertEq(storedExpo, int32(expo));
        assertEq(publishTime, endTime);
    }

    function test_tieBehavior_overWinsOnTie_true() public {
        uint64 endTime = 2000;
        int16 expo = -8;
        int64 strike = 100;
        vm.warp(endTime);

        bytes[] memory updateData = _updateData(_payload(endTime, FEED_ID, uint64(uint64(int64(strike))), expo)); // price == strike
        PredictionMarketPythLazerResolver.BinaryOptionMarket memory market = PredictionMarketPythLazerResolver
            .BinaryOptionMarket({priceId: PRICE_ID, endTime: endTime, strikePrice: strike, strikeExpo: int32(expo), overWinsOnTie: true});

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertTrue(resolvedToOver);

        // Maker predicts over should win
        bytes memory encoded = _encodeOutcome(PRICE_ID, endTime, strike, int32(expo), true, true);
        (, , bool parlaySuccess) = resolver.getPredictionResolution(encoded);
        assertTrue(parlaySuccess);
    }

    function test_tieBehavior_overWinsOnTie_false() public {
        uint64 endTime = 2000;
        int16 expo = -8;
        int64 strike = 100;
        vm.warp(endTime);

        bytes[] memory updateData = _updateData(_payload(endTime, FEED_ID, uint64(uint64(int64(strike))), expo)); // price == strike
        PredictionMarketPythLazerResolver.BinaryOptionMarket memory market = PredictionMarketPythLazerResolver
            .BinaryOptionMarket({priceId: PRICE_ID, endTime: endTime, strikePrice: strike, strikeExpo: int32(expo), overWinsOnTie: false});

        (, bool resolvedToOver) = resolver.settleMarket(market, updateData);
        assertFalse(resolvedToOver);

        // Maker predicts over should lose
        bytes memory encoded = _encodeOutcome(PRICE_ID, endTime, strike, int32(expo), false, true);
        (, , bool parlaySuccess) = resolver.getPredictionResolution(encoded);
        assertFalse(parlaySuccess);
    }

    function test_settleMarket_revertOnExpoMismatch() public {
        uint64 endTime = 2000;
        vm.warp(endTime);

        bytes[] memory updateData = _updateData(_payload(endTime, FEED_ID, 150, -8));
        PredictionMarketPythLazerResolver.BinaryOptionMarket memory market = PredictionMarketPythLazerResolver
            .BinaryOptionMarket({priceId: PRICE_ID, endTime: endTime, strikePrice: 100, strikeExpo: -6, overWinsOnTie: true});

        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketPythLazerResolver.StrikeExpoMismatch.selector,
                int32(-6),
                int32(-8)
            )
        );
        resolver.settleMarket(market, updateData);
    }

    function test_settleMarket_revertIfTimestampOutOfRange() public {
        // publishTimeWindowSeconds == 0 => must match endTime
        uint64 endTime = 2000;
        int16 expo = -8;
        vm.warp(endTime);

        bytes[] memory updateData = _updateData(_payload(endTime + 1, FEED_ID, 150, expo));
        PredictionMarketPythLazerResolver.BinaryOptionMarket memory market = PredictionMarketPythLazerResolver
            .BinaryOptionMarket({priceId: PRICE_ID, endTime: endTime, strikePrice: 100, strikeExpo: int32(expo), overWinsOnTie: true});

        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketPythLazerResolver.TimestampOutOfWindow.selector,
                uint64(endTime + 1),
                endTime,
                endTime
            )
        );
        resolver.settleMarket(market, updateData);
    }
}


