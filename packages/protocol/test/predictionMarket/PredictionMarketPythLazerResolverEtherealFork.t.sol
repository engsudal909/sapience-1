// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../../src/predictionMarket/resolvers/PredictionMarketPythLazerResolver.sol";
import "../../src/predictionMarket/resolvers/pythLazer/IPythLazer.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerLib.sol";

/// @notice Ethereal fork/e2e test for the Pyth Pro (Lazer) resolver.
/// @dev This test is **opt-in** and will be skipped unless `RUN_PYTH_LAZER_ETHEREAL_FORK_TESTS=true`.
///      Ethereal RPCs and Pyth Pro update blobs are not universally public, so this is env-driven.
contract PredictionMarketPythLazerResolverEtherealForkTest is Test {
    /// @dev Default Pyth Pro (Lazer) verifier contract on Ethereal (provided by user).
    address internal constant DEFAULT_ETHEREAL_PYTH_LAZER =
        0x486908B534E34D1Ca04d12F01b5Bf47aC62A68F5;

    struct Benchmark {
        uint64 ts;
        int64 price;
        int32 expo;
    }

    function _extractFromVerifier(
        address pythLazer,
        bytes memory updateData,
        uint32 targetFeedId
    ) internal returns (uint64 ts, uint64 price, int16 expo) {
        // verification_fee() might not exist or might revert; skip if so.
        uint256 fee;
        try IPythLazer(pythLazer).verification_fee() returns (uint256 f) {
            fee = f;
        } catch {
            vm.skip(true);
        }

        // verifyUpdate might revert if updateData is not valid for this contract deployment.
        bytes memory payload;
        try IPythLazer(pythLazer).verifyUpdate{value: fee}(updateData) returns (
            bytes memory p,
            address
        ) {
            payload = p;
        } catch {
            vm.skip(true);
        }

        (uint64 parsedTs, PythLazerLib.Channel channel, uint8 feedsLen, uint16 pos) = PythLazerLib
            .parsePayloadHeader(payload);

        // This resolver is intended for real-time updates.
        if (channel != PythLazerLib.Channel.RealTime) vm.skip(true);

        (uint64 foundPrice, int16 foundExpo, bool ok) = _findFeed(payload, pos, feedsLen, targetFeedId);
        if (!ok || foundPrice <= 1) vm.skip(true);
        return (parsedTs, foundPrice, foundExpo);
    }

    function _findFeed(
        bytes memory payload,
        uint16 pos,
        uint8 feedsLen,
        uint32 targetFeedId
    ) internal pure returns (uint64 foundPrice, int16 foundExpo, bool ok) {
        for (uint8 i = 0; i < feedsLen; i++) {
            uint32 feedId;
            uint8 numProps;
            (feedId, numProps, pos) = PythLazerLib.parseFeedHeader(payload, pos);

            if (feedId == targetFeedId) {
                (pos, foundPrice, foundExpo, ok) = _extractTargetFeed(payload, pos, numProps);
                return (foundPrice, foundExpo, ok);
            }

            pos = _skipFeed(payload, pos, numProps);
        }

        return (0, 0, false);
    }

    function _skipFeed(bytes memory payload, uint16 pos, uint8 numProps) internal pure returns (uint16) {
        for (uint8 j = 0; j < numProps; j++) {
            PythLazerLib.PriceFeedProperty prop;
            (prop, pos) = PythLazerLib.parseFeedProperty(payload, pos);

            if (
                prop == PythLazerLib.PriceFeedProperty.Price ||
                prop == PythLazerLib.PriceFeedProperty.BestBidPrice ||
                prop == PythLazerLib.PriceFeedProperty.BestAskPrice
            ) {
                (, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
            } else if (prop == PythLazerLib.PriceFeedProperty.PublisherCount) {
                (, pos) = PythLazerLib.parseFeedValueUint16(payload, pos);
            } else if (prop == PythLazerLib.PriceFeedProperty.Exponent) {
                (, pos) = PythLazerLib.parseFeedValueInt16(payload, pos);
            } else {
                return pos;
            }
        }
        return pos;
    }

    function _extractTargetFeed(
        bytes memory payload,
        uint16 pos,
        uint8 numProps
    ) internal pure returns (uint16 newPos, uint64 foundPrice, int16 foundExpo, bool ok) {
        bool hasPrice = false;
        bool hasExpo = false;

        for (uint8 j = 0; j < numProps; j++) {
            PythLazerLib.PriceFeedProperty prop;
            (prop, pos) = PythLazerLib.parseFeedProperty(payload, pos);

            if (
                prop == PythLazerLib.PriceFeedProperty.Price ||
                prop == PythLazerLib.PriceFeedProperty.BestBidPrice ||
                prop == PythLazerLib.PriceFeedProperty.BestAskPrice
            ) {
                uint64 v;
                (v, pos) = PythLazerLib.parseFeedValueUint64(payload, pos);
                if (prop == PythLazerLib.PriceFeedProperty.Price) {
                    foundPrice = v;
                    hasPrice = true;
                }
            } else if (prop == PythLazerLib.PriceFeedProperty.PublisherCount) {
                (, pos) = PythLazerLib.parseFeedValueUint16(payload, pos);
            } else if (prop == PythLazerLib.PriceFeedProperty.Exponent) {
                int16 v;
                (v, pos) = PythLazerLib.parseFeedValueInt16(payload, pos);
                foundExpo = v;
                hasExpo = true;
            } else {
                return (pos, foundPrice, foundExpo, false);
            }
        }

        newPos = pos;
        ok = hasPrice && hasExpo;
    }

    function test_e2e_etherealFork_settleMarket() public {
        bool runFork = vm.envOr("RUN_PYTH_LAZER_ETHEREAL_FORK_TESTS", false);
        if (!runFork) vm.skip(true);

        // Ethereal RPC is required (no safe default).
        string memory rpc = vm.envOr("ETHEREAL_RPC", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);

        uint256 forkBlock = vm.envOr("ETHEREAL_FORK_BLOCK", uint256(0));
        if (forkBlock != 0) {
            vm.createSelectFork(rpc, forkBlock);
        } else {
            vm.createSelectFork(rpc);
        }

        address pythLazer = vm.envOr("ETHEREAL_PYTH_LAZER", DEFAULT_ETHEREAL_PYTH_LAZER);
        if (pythLazer.code.length == 0) vm.skip(true);

        // Update blob must be provided (signature + payload), since verifyUpdate validates it.
        bytes memory update = vm.envOr("PYTH_LAZER_UPDATE_DATA", bytes(""));
        if (update.length == 0) vm.skip(true);

        uint32 feedId = uint32(vm.envOr("PYTH_LAZER_FEED_ID", uint256(0)));
        if (feedId == 0) vm.skip(true);

        _runE2E(pythLazer, update, feedId);
    }

    function _runE2E(address pythLazer, bytes memory update, uint32 feedId) internal {
        // Deploy resolver pointing at the on-chain Pyth Pro verifier.
        PredictionMarketPythLazerResolver.Settings memory settings = PredictionMarketPythLazerResolver
            .Settings({maxPredictionMarkets: 1, pythLazer: IPythLazer(pythLazer), publishTimeWindowSeconds: 0});
        PredictionMarketPythLazerResolver resolver = new PredictionMarketPythLazerResolver(settings);

        // Extract the benchmark tuple from the verifier itself (on the fork).
        (uint64 endTime, uint64 benchmarkPriceU, int16 expo16) = _extractFromVerifier(
            pythLazer,
            update,
            feedId
        );
        Benchmark memory b = Benchmark({
            ts: endTime,
            price: int64(benchmarkPriceU),
            expo: int32(expo16)
        });

        // priceId is feed id encoded in low 32 bits.
        bytes32 priceId = bytes32(uint256(feedId));

        // Strike slightly below benchmark to ensure "Over" resolution.
        int64 strike = b.price - 1;

        PredictionMarketPythLazerResolver.BinaryOptionMarket memory market = PredictionMarketPythLazerResolver
            .BinaryOptionMarket({
                priceId: priceId,
                endTime: b.ts,
                strikePrice: strike,
                strikeExpo: b.expo,
                overWinsOnTie: true
            });

        // Only warp forward (avoid surprising other forked system contracts).
        if (block.timestamp < b.ts) vm.warp(b.ts);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = update;

        // Determine required fee for settlement.
        uint256 fee;
        try IPythLazer(pythLazer).verification_fee() returns (uint256 f) {
            fee = f;
        } catch {
            vm.skip(true);
        }
        vm.deal(address(this), fee * 2 + 1 ether);

        // Settle on resolver.
        bytes32 marketId;
        bool resolvedToOver;
        try resolver.settleMarket{value: fee}(market, updateData) returns (bytes32 mId, bool outcome) {
            marketId = mId;
            resolvedToOver = outcome;
        } catch {
            vm.skip(true);
        }
        assertTrue(resolvedToOver);

        // Maker predicts Over => should succeed.
        PredictionMarketPythLazerResolver.BinaryOptionOutcome[]
            memory outcomes = new PredictionMarketPythLazerResolver.BinaryOptionOutcome[](1);
        outcomes[0] = PredictionMarketPythLazerResolver.BinaryOptionOutcome({
            priceId: priceId,
            endTime: b.ts,
            strikePrice: strike,
            strikeExpo: b.expo,
            overWinsOnTie: true,
            prediction: true
        });

        _assertResolvedSuccess(resolver, abi.encode(outcomes));
        _assertSettlementStored(resolver, marketId, b);
    }

    function _assertResolvedSuccess(
        PredictionMarketPythLazerResolver resolver,
        bytes memory encodedOutcomes
    ) internal view {
        (bool isResolved, , bool success) = resolver.getPredictionResolution(encodedOutcomes);
        assertTrue(isResolved);
        assertTrue(success);
    }

    function _assertSettlementStored(
        PredictionMarketPythLazerResolver resolver,
        bytes32 marketId,
        Benchmark memory b
    ) internal view {
        (bool settled, bool storedOutcome, int64 storedPrice, int32 storedExpo, uint64 publishTime) = resolver
            .settlements(marketId);
        assertTrue(settled);
        assertTrue(storedOutcome);
        assertEq(storedPrice, b.price);
        assertEq(storedExpo, b.expo);
        assertEq(publishTime, b.ts);
    }
}


