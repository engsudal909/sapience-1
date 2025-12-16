// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPredictionMarketResolver} from "../interfaces/IPredictionMarketResolver.sol";
import {IPyth} from "./pyth/IPyth.sol";
import {PythStructs} from "./pyth/PythStructs.sol";

/// @title PredictionMarketPythBenchmarkResolver
/// @notice Resolver for binary options settled using Pyth Benchmarks (historical pull-oracle verification).
/// @dev `getPredictionResolution` is view-only, so settlement is performed via an explicit `settleMarket` tx
///      that verifies the benchmark update on-chain and stores the result.
contract PredictionMarketPythBenchmarkResolver is
    IPredictionMarketResolver,
    ReentrancyGuard
{
    // ============ Custom Errors ============
    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error MarketNotEnded();
    error MarketAlreadySettled();
    error InvalidMarketData();
    error InsufficientUpdateFee(uint256 required, uint256 provided);
    error StrikeExpoMismatch(int32 strikeExpo, int32 priceExpo);
    error RefundFailed();

    // ============ Events ============
    event ConfigInitialized(
        address indexed pyth,
        uint256 maxPredictionMarkets,
        uint64 publishTimeWindowSeconds
    );

    event MarketSettled(
        bytes32 indexed marketId,
        bytes32 indexed priceId,
        uint64 indexed endTime,
        bool resolvedToOver,
        int64 benchmarkPrice,
        int32 benchmarkExpo,
        uint64 publishTime
    );

    // ============ Settings ============
    struct Settings {
        uint256 maxPredictionMarkets;
        IPyth pyth;
        /// @notice Allowed window for benchmark publishTime: [endTime, endTime + publishTimeWindowSeconds].
        /// @dev Default 0 enforces exact timestamp. Increase if the chain/feed timestamps are not exactly aligned.
        uint64 publishTimeWindowSeconds;
    }

    uint256 public immutable maxPredictionMarkets;
    IPyth public immutable pyth;
    uint64 public immutable publishTimeWindowSeconds;

    // ============ Binary Option Encoding ============
    struct BinaryOptionMarket {
        bytes32 priceId;
        uint64 endTime;
        int64 strikePrice;
        int32 strikeExpo;
        bool overWinsOnTie; // default true (price >= strike)
    }

    /// @notice One predicted outcome in a parlay.
    /// @dev `prediction` is the maker's bet: true = Over, false = Under.
    struct BinaryOptionOutcome {
        bytes32 priceId;
        uint64 endTime;
        int64 strikePrice;
        int32 strikeExpo;
        bool overWinsOnTie;
        bool prediction;
    }

    struct MarketSettlement {
        bool settled;
        bool resolvedToOver;
        int64 benchmarkPrice;
        int32 benchmarkExpo;
        uint64 publishTime;
    }

    mapping(bytes32 => MarketSettlement) public settlements; // marketId => settlement

    constructor(Settings memory _config) {
        maxPredictionMarkets = _config.maxPredictionMarkets;
        pyth = _config.pyth;
        publishTimeWindowSeconds = _config.publishTimeWindowSeconds;

        emit ConfigInitialized(
            address(_config.pyth),
            _config.maxPredictionMarkets,
            _config.publishTimeWindowSeconds
        );
    }

    // ============ Resolver Interface ============
    function validatePredictionMarkets(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isValid, Error error) {
        isValid = true;
        error = Error.NO_ERROR;

        BinaryOptionOutcome[] memory outcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );

        if (outcomes.length == 0) revert MustHaveAtLeastOneMarket();
        if (outcomes.length > maxPredictionMarkets) revert TooManyMarkets();

        for (uint256 i = 0; i < outcomes.length; i++) {
            if (outcomes[i].priceId == bytes32(0)) {
                return (false, Error.INVALID_MARKET);
            }
            // Market must not be expired at mint time
            if (outcomes[i].endTime <= block.timestamp) {
                return (false, Error.MARKET_NOT_OPENED);
            }
            // Strike sanity
            if (outcomes[i].strikePrice <= 0) {
                return (false, Error.INVALID_MARKET);
            }
        }
    }

    function getPredictionResolution(
        bytes calldata encodedPredictedOutcomes
    ) external view returns (bool isResolved, Error error, bool parlaySuccess) {
        BinaryOptionOutcome[] memory outcomes = decodePredictionOutcomes(
            encodedPredictedOutcomes
        );

        parlaySuccess = true;
        isResolved = true;
        error = Error.NO_ERROR;
        bool hasUnsettledMarkets = false;

        if (outcomes.length == 0) {
            return (false, Error.MUST_HAVE_AT_LEAST_ONE_MARKET, true);
        }
        if (outcomes.length > maxPredictionMarkets) {
            return (false, Error.TOO_MANY_MARKETS, true);
        }

        for (uint256 i = 0; i < outcomes.length; i++) {
            if (outcomes[i].priceId == bytes32(0)) {
                return (false, Error.INVALID_MARKET, true);
            }

            bytes32 marketId = getMarketId(
                BinaryOptionMarket({
                    priceId: outcomes[i].priceId,
                    endTime: outcomes[i].endTime,
                    strikePrice: outcomes[i].strikePrice,
                    strikeExpo: outcomes[i].strikeExpo,
                    overWinsOnTie: outcomes[i].overWinsOnTie
                })
            );

            MarketSettlement memory s = settlements[marketId];
            if (!s.settled) {
                hasUnsettledMarkets = true;
                continue;
            }

            bool marketOutcomeOver = s.resolvedToOver;
            if (outcomes[i].prediction != marketOutcomeOver) {
                // decisive loss
                return (true, Error.NO_ERROR, false);
            }
        }

        if (hasUnsettledMarkets) {
            return (false, Error.MARKET_NOT_SETTLED, true);
        }

        return (true, Error.NO_ERROR, true);
    }

    // ============ Settlement ============
    function settleMarket(
        BinaryOptionMarket calldata market,
        bytes[] calldata updateData
    ) external payable nonReentrant returns (bytes32 marketId, bool resolvedToOver) {
        if (market.priceId == bytes32(0)) revert InvalidMarketData();
        if (market.strikePrice <= 0) revert InvalidMarketData();
        if (block.timestamp < market.endTime) revert MarketNotEnded();

        marketId = getMarketId(market);
        if (settlements[marketId].settled) revert MarketAlreadySettled();

        uint64 minPublishTime = market.endTime;
        uint64 maxPublishTime = market.endTime;
        if (publishTimeWindowSeconds != 0) {
            unchecked {
                maxPublishTime = market.endTime + publishTimeWindowSeconds;
            }
            if (maxPublishTime < market.endTime) revert InvalidMarketData();
        }

        // Verify the benchmark update on-chain
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = market.priceId;

        uint256 fee = pyth.getUpdateFee(updateData);
        if (msg.value < fee) revert InsufficientUpdateFee(fee, msg.value);

        PythStructs.PriceFeed[] memory feeds = pyth.parsePriceFeedUpdates{
            value: fee
        }(updateData, ids, minPublishTime, maxPublishTime);

        if (feeds.length == 0 || feeds[0].id != market.priceId) revert InvalidMarketData();

        PythStructs.Price memory p = feeds[0].price;

        // Preferred: avoid rounding by requiring exact exponent match.
        if (p.expo != market.strikeExpo) {
            revert StrikeExpoMismatch(market.strikeExpo, p.expo);
        }

        resolvedToOver = market.overWinsOnTie
            ? (p.price >= market.strikePrice)
            : (p.price > market.strikePrice);

        settlements[marketId] = MarketSettlement({
            settled: true,
            resolvedToOver: resolvedToOver,
            benchmarkPrice: p.price,
            benchmarkExpo: p.expo,
            publishTime: p.publishTime
        });

        emit MarketSettled(
            marketId,
            market.priceId,
            market.endTime,
            resolvedToOver,
            p.price,
            p.expo,
            p.publishTime
        );

        // Refund excess ETH (if any)
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
    }

    // ============ Encoding / Decoding ============
    function encodePredictionOutcomes(
        BinaryOptionOutcome[] calldata outcomes
    ) external pure returns (bytes memory) {
        return abi.encode(outcomes);
    }

    function decodePredictionOutcomes(
        bytes calldata encodedPredictedOutcomes
    ) public pure returns (BinaryOptionOutcome[] memory) {
        return abi.decode(encodedPredictedOutcomes, (BinaryOptionOutcome[]));
    }

    function getMarketId(
        BinaryOptionMarket memory market
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    market.priceId,
                    market.endTime,
                    market.strikePrice,
                    market.strikeExpo,
                    market.overWinsOnTie
                )
            );
    }
}


