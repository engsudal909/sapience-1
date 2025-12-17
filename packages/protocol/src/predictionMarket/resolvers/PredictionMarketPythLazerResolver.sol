// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPredictionMarketResolver} from "../interfaces/IPredictionMarketResolver.sol";
import {IPythLazer} from "./pythLazer/IPythLazer.sol";
import {PythLazerLib} from "./pythLazer/PythLazerLib.sol";

/// @title PredictionMarketPythLazerResolver
/// @notice Resolver for binary options settled using Pyth Pro (formerly Lazer) updates.
/// @dev `getPredictionResolution` is view-only; settlement is done via `settleMarket` which verifies an update on-chain.
contract PredictionMarketPythLazerResolver is IPredictionMarketResolver, ReentrancyGuard {
    // ============ Custom Errors ============
    error MustHaveAtLeastOneMarket();
    error TooManyMarkets();
    error MarketNotEnded();
    error MarketAlreadySettled();
    error InvalidMarketData();
    error InvalidPriceIdFormat(bytes32 priceId);
    error InvalidUpdateData();
    error InsufficientUpdateFee(uint256 required, uint256 provided);
    error TimestampOutOfWindow(uint64 timestamp, uint64 min, uint64 max);
    error UnexpectedChannel(PythLazerLib.Channel channel);
    error PriceFeedNotFound(uint32 feedId);
    error StrikeExpoMismatch(int32 strikeExpo, int32 priceExpo);
    error RefundFailed();

    // ============ Events ============
    event ConfigInitialized(
        address indexed pythLazer,
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
        IPythLazer pythLazer;
        /// @notice Allowed window for update timestamp: [endTime, endTime + publishTimeWindowSeconds].
        /// @dev Default 0 enforces exact timestamp.
        uint64 publishTimeWindowSeconds;
    }

    uint256 public immutable maxPredictionMarkets;
    IPythLazer public immutable pythLazer;
    uint64 public immutable publishTimeWindowSeconds;

    // ============ Binary Option Encoding ============
    /// @dev `priceId` is treated as a **Pyth Pro feed id**, encoded in the low 32 bits of the bytes32.
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
        pythLazer = _config.pythLazer;
        publishTimeWindowSeconds = _config.publishTimeWindowSeconds;

        emit ConfigInitialized(
            address(_config.pythLazer),
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
            if (outcomes[i].priceId == bytes32(0)) return (false, Error.INVALID_MARKET);
            if (!_isValidFeedId(outcomes[i].priceId)) return (false, Error.INVALID_MARKET);

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

        if (outcomes.length == 0) return (false, Error.MUST_HAVE_AT_LEAST_ONE_MARKET, true);
        if (outcomes.length > maxPredictionMarkets) return (false, Error.TOO_MANY_MARKETS, true);

        for (uint256 i = 0; i < outcomes.length; i++) {
            if (outcomes[i].priceId == bytes32(0)) return (false, Error.INVALID_MARKET, true);

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

        if (hasUnsettledMarkets) return (false, Error.MARKET_NOT_SETTLED, true);
        return (true, Error.NO_ERROR, true);
    }

    // ============ Settlement ============
    /// @notice Verify a Pyth Pro update on-chain and store the settlement result for `market`.
    /// @param updateData Pyth Pro update(s). This resolver expects `updateData.length == 1`.
    function settleMarket(
        BinaryOptionMarket calldata market,
        bytes[] calldata updateData
    )
        external
        payable
        nonReentrant
        returns (bytes32 marketId, bool resolvedToOver)
    {
        if (market.priceId == bytes32(0)) revert InvalidMarketData();
        if (!_isValidFeedId(market.priceId)) revert InvalidPriceIdFormat(market.priceId);
        if (market.strikePrice <= 0) revert InvalidMarketData();
        if (block.timestamp < market.endTime) revert MarketNotEnded();
        if (updateData.length != 1) revert InvalidUpdateData();

        marketId = getMarketId(market);
        if (settlements[marketId].settled) revert MarketAlreadySettled();

        uint64 minTs = market.endTime;
        uint64 maxTs = market.endTime;
        if (publishTimeWindowSeconds != 0) {
            unchecked {
                maxTs = market.endTime + publishTimeWindowSeconds;
            }
            if (maxTs < market.endTime) revert InvalidMarketData();
        }

        uint256 fee = pythLazer.verification_fee();
        if (msg.value < fee) revert InsufficientUpdateFee(fee, msg.value);

        // Verify update on-chain: returns the signed payload and signer address.
        (bytes memory payload, ) = pythLazer.verifyUpdate{value: fee}(updateData[0]);

        (uint64 ts, int64 benchmarkPrice, int32 benchmarkExpo) = _extractPrice(
            payload,
            _feedIdFromPriceId(market.priceId)
        );

        if (ts < minTs || ts > maxTs) revert TimestampOutOfWindow(ts, minTs, maxTs);

        // Preferred: avoid rounding by requiring exact exponent match.
        if (benchmarkExpo != market.strikeExpo) {
            revert StrikeExpoMismatch(market.strikeExpo, benchmarkExpo);
        }

        resolvedToOver = market.overWinsOnTie
            ? (benchmarkPrice >= market.strikePrice)
            : (benchmarkPrice > market.strikePrice);

        settlements[marketId] = MarketSettlement({
            settled: true,
            resolvedToOver: resolvedToOver,
            benchmarkPrice: benchmarkPrice,
            benchmarkExpo: benchmarkExpo,
            publishTime: ts
        });

        emit MarketSettled(
            marketId,
            market.priceId,
            market.endTime,
            resolvedToOver,
            benchmarkPrice,
            benchmarkExpo,
            ts
        );

        // Refund excess ETH (if any)
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
    }

    function _extractPrice(
        bytes memory payload,
        uint32 targetFeedId
    ) internal pure returns (uint64 timestamp, int64 price, int32 expo) {
        (uint64 ts, PythLazerLib.Channel channel, uint8 feedsLen, uint16 pos) = PythLazerLib
            .parsePayloadHeader(payload);

        // This resolver is intended for real-time updates.
        if (channel != PythLazerLib.Channel.RealTime) revert UnexpectedChannel(channel);

        timestamp = ts;
        (uint64 foundPrice, int16 foundExpo) = _findFeed(payload, pos, feedsLen, targetFeedId);

        // Convert to protocol-friendly types.
        // Pyth Pro price values are unsigned; protocol strikes are positive, so int64 is safe under typical feeds.
        if (foundPrice > uint64(type(int64).max)) revert("price too large");

        price = int64(foundPrice);
        expo = int32(foundExpo);
    }

    function _findFeed(
        bytes memory payload,
        uint16 pos,
        uint8 feedsLen,
        uint32 targetFeedId
    ) private pure returns (uint64 foundPrice, int16 foundExpo) {
        for (uint8 i = 0; i < feedsLen; i++) {
            uint32 feedId;
            uint8 numProps;
            (feedId, numProps, pos) = PythLazerLib.parseFeedHeader(payload, pos);

            if (feedId == targetFeedId) {
                (pos, foundPrice, foundExpo) = _extractTargetFeed(payload, pos, numProps, targetFeedId);
                return (foundPrice, foundExpo);
            }

            pos = _skipFeed(payload, pos, numProps);
        }

        revert PriceFeedNotFound(targetFeedId);
    }

    function _skipFeed(
        bytes memory payload,
        uint16 pos,
        uint8 numProps
    ) private pure returns (uint16) {
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
                revert("unknown property");
            }
        }
        return pos;
    }

    function _extractTargetFeed(
        bytes memory payload,
        uint16 pos,
        uint8 numProps,
        uint32 targetFeedId
    ) private pure returns (uint16 newPos, uint64 foundPrice, int16 foundExpo) {
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
                revert("unknown property");
            }
        }

        newPos = pos;
        if (!(hasPrice && hasExpo)) revert PriceFeedNotFound(targetFeedId);
    }

    function _isValidFeedId(bytes32 priceId) internal pure returns (bool) {
        // We interpret priceId as a uint32 feed id in the low 32 bits.
        // Reject any non-zero high bits to avoid accidental mixing with 32-byte Pyth Core feed ids.
        return (uint256(priceId) >> 32) == 0;
    }

    function _feedIdFromPriceId(bytes32 priceId) internal pure returns (uint32) {
        return uint32(uint256(priceId));
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


