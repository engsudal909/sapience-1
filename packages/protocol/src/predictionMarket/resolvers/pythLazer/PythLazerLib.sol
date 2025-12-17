// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

/// @notice Minimal Pyth Pro (Lazer) payload parsing helpers.
/// @dev Ported from `pyth-network/pyth-crosschain` (lazer/contracts/evm/src/PythLazerLib.sol),
///      with `bytes` in memory so consumers can parse ABI-decoded payloads.
library PythLazerLib {
    enum PriceFeedProperty {
        Price,
        BestBidPrice,
        BestAskPrice,
        PublisherCount,
        Exponent
    }

    enum Channel {
        Invalid,
        RealTime,
        FixedRate50,
        FixedRate200
    }

    function _readUint32(bytes memory b, uint256 pos) private pure returns (uint32 v) {
        // Read 4 bytes starting at `pos` (big-endian) from a `bytes` array in memory.
        assembly {
            v := shr(224, mload(add(add(b, 0x20), pos)))
        }
    }

    function _readUint64(bytes memory b, uint256 pos) private pure returns (uint64 v) {
        // Read 8 bytes starting at `pos` (big-endian).
        assembly {
            v := shr(192, mload(add(add(b, 0x20), pos)))
        }
    }

    function _readUint16(bytes memory b, uint256 pos) private pure returns (uint16 v) {
        // Read 2 bytes starting at `pos` (big-endian).
        assembly {
            v := shr(240, mload(add(add(b, 0x20), pos)))
        }
    }

    function parsePayloadHeader(
        bytes memory payload
    )
        internal
        pure
        returns (uint64 timestamp, Channel channel, uint8 feedsLen, uint16 pos)
    {
        uint32 FORMAT_MAGIC = 2479346549;

        pos = 0;
        uint32 magic = _readUint32(payload, pos);
        pos += 4;
        if (magic != FORMAT_MAGIC) revert("invalid magic");

        timestamp = _readUint64(payload, pos);
        pos += 8;

        channel = Channel(uint8(payload[pos]));
        pos += 1;

        feedsLen = uint8(payload[pos]);
        pos += 1;
    }

    function parseFeedHeader(
        bytes memory payload,
        uint16 pos
    )
        internal
        pure
        returns (uint32 feedId, uint8 numProperties, uint16 newPos)
    {
        feedId = _readUint32(payload, pos);
        pos += 4;
        numProperties = uint8(payload[pos]);
        pos += 1;
        newPos = pos;
    }

    function parseFeedProperty(
        bytes memory payload,
        uint16 pos
    ) internal pure returns (PriceFeedProperty property, uint16 newPos) {
        property = PriceFeedProperty(uint8(payload[pos]));
        pos += 1;
        newPos = pos;
    }

    function parseFeedValueUint64(
        bytes memory payload,
        uint16 pos
    ) internal pure returns (uint64 value, uint16 newPos) {
        value = _readUint64(payload, pos);
        pos += 8;
        newPos = pos;
    }

    function parseFeedValueUint16(
        bytes memory payload,
        uint16 pos
    ) internal pure returns (uint16 value, uint16 newPos) {
        value = _readUint16(payload, pos);
        pos += 2;
        newPos = pos;
    }

    function parseFeedValueInt16(
        bytes memory payload,
        uint16 pos
    ) internal pure returns (int16 value, uint16 newPos) {
        value = int16(uint16(_readUint16(payload, pos)));
        pos += 2;
        newPos = pos;
    }
}


