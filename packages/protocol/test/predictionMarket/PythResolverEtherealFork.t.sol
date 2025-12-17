// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../../src/predictionMarket/resolvers/PythResolver.sol";
import "../../src/predictionMarket/resolvers/pythLazer/IPythLazer.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerLib.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerLibBytes.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerStructs.sol";

interface IPythLazerAdmin {
    function owner() external view returns (address);

    function updateTrustedSigner(address trustedSigner, uint256 expiresAt) external;
}

/// @notice Ethereal fork/e2e test for the Pyth Lazer-based resolver.
/// @dev This test is **opt-in** and will be skipped unless `RUN_PYTH_ETHEREAL_FORK_TESTS=true`.
contract PythResolverEtherealForkTest is Test {
    string internal constant DEFAULT_ETHEREAL_RPC = "https://rpc.ethereal.trade";

    // Deployed PythLazer verifier on Ethereal (provided by user).
    address internal constant ETHEREAL_PYTH_LAZER_VERIFIER =
        0x486908B534E34D1Ca04d12F01b5Bf47aC62A68F5;

    // Hardcoded EVM update blob from `https://pyth-lazer.dourolabs.app/v1/price`
    // Request params used:
    // - priceFeedIds=[1,2]
    // - properties=["price","exponent"]
    // - formats=["evm"]
    // - channel="fixed_rate@50ms"
    // - jsonBinaryEncoding="hex"
    bytes internal constant UPDATE_BLOB =
        hex"2a22999a23b2e8f7d06b0ea8fb6042cce562200075d760922584553e1caa2ace98891bf21335bff89d33e9d9961fe2d42e742ee044e260973803c56f0c4ff58ea1af5b8f01003093c7d3750006462cf6b7a6000202000000010200000007d1aff3c50304fff800000002020000000041a04fa7a904fff8";

    function _readU16BE(bytes memory b, uint256 pos) private pure returns (uint16 v) {
        require(pos + 2 <= b.length, "oob");
        uint256 w;
        assembly {
            w := mload(add(add(b, 0x20), pos))
        }
        v = uint16(w >> 240);
    }

    function _readBytes32(bytes memory b, uint256 pos) private pure returns (bytes32 v) {
        require(pos + 32 <= b.length, "oob");
        assembly {
            v := mload(add(add(b, 0x20), pos))
        }
    }

    function _readU8(bytes memory b, uint256 pos) private pure returns (uint8 v) {
        require(pos + 1 <= b.length, "oob");
        assembly {
            v := byte(0, mload(add(add(b, 0x20), pos)))
        }
    }

    function _recoverSignerFromUpdate(bytes memory update) private pure returns (address signer) {
        require(update.length >= 71, "input too short");

        // Layout per upstream `PythLazer.verifyUpdate`:
        // [0:4] magic
        // [4:36] r
        // [36:68] s
        // [68] v (0/1)
        // [69:71] payload_len (uint16)
        // [71:71+payload_len] payload
        bytes32 r = _readBytes32(update, 4);
        bytes32 s = _readBytes32(update, 36);
        uint8 v = _readU8(update, 68) + 27;
        uint16 payloadLen = _readU16BE(update, 69);
        require(update.length >= 71 + payloadLen, "input too short");

        bytes32 hash;
        assembly {
            hash := keccak256(add(add(update, 0x20), 71), payloadLen)
        }

        signer = ecrecover(hash, v, r, s);
    }

    function _findFeed(
        PythLazerStructs.Update memory u,
        uint32 feedId
    ) internal pure returns (PythLazerStructs.Feed memory feed, bool found) {
        for (uint256 i = 0; i < u.feeds.length; i++) {
            if (u.feeds[i].feedId == feedId) {
                return (u.feeds[i], true);
            }
        }
        return (feed, false);
    }

    function _decodeFeedFromBlob(
        IPythLazer lazer,
        uint256 fee,
        uint32 feedId
    )
        internal
        returns (uint64 endTime, int64 price, int32 expo)
    {
        (bytes memory payload, ) = lazer.verifyUpdate{value: fee}(UPDATE_BLOB);
        PythLazerStructs.Update memory u = PythLazerLibBytes
            .parseUpdateFromPayloadBytes(payload);

        endTime = uint64(u.timestamp / 1_000_000);

        (PythLazerStructs.Feed memory feed, bool found) = _findFeed(u, feedId);
        assertTrue(found);

        price = PythLazerLib.getPrice(feed);
        expo = int32(PythLazerLib.getExponent(feed));
    }

    function test_e2e_etherealFork_settleMarket_feed1_and_feed2() public {
        bool runFork = vm.envOr("RUN_PYTH_ETHEREAL_FORK_TESTS", false);
        if (!runFork) vm.skip(true);

        // Fork Ethereal (optionally pinned)
        {
            string memory rpc = vm.envOr("ETHEREAL_RPC", DEFAULT_ETHEREAL_RPC);
            uint256 forkBlock = vm.envOr("ETHEREAL_FORK_BLOCK", uint256(0));
            if (forkBlock != 0) {
                vm.createSelectFork(rpc, forkBlock);
            } else {
                vm.createSelectFork(rpc);
            }
        }

        if (ETHEREAL_PYTH_LAZER_VERIFIER.code.length == 0) {
            vm.skip(true);
        }

        IPythLazer lazer = IPythLazer(ETHEREAL_PYTH_LAZER_VERIFIER);
        uint256 fee = lazer.verification_fee();
        vm.deal(address(this), 1 ether);

        // Ensure the recovered signer is trusted on the verifier (fork-local state only).
        // This makes the test robust even if the on-chain verifier hasn't been configured yet.
        {
            address signer = _recoverSignerFromUpdate(UPDATE_BLOB);
            if (signer == address(0)) vm.skip(true);

            address owner;
            try IPythLazerAdmin(ETHEREAL_PYTH_LAZER_VERIFIER).owner() returns (
                address o
            ) {
                owner = o;
            } catch {
                vm.skip(true);
            }

            vm.prank(owner);
            try
                IPythLazerAdmin(ETHEREAL_PYTH_LAZER_VERIFIER)
                    .updateTrustedSigner(signer, block.timestamp + 30 days)
            {} catch {
                vm.skip(true);
            }
        }

        // Deploy resolver configured for Ethereal Lazer verifier.
        PythResolver.Settings memory settings = PythResolver.Settings({
            maxPredictionMarkets: 2,
            pythLazer: lazer,
            publishTimeWindowSeconds: 0
        });
        PythResolver resolver = new PythResolver(settings);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = UPDATE_BLOB;

        // Decode timestamp once (same for both feeds) so we can warp.
        uint64 endTime;
        {
            (endTime, , ) = _decodeFeedFromBlob(lazer, fee, 1);
        }

        vm.warp(endTime);

        // Market for feedId=1
        {
            (, int64 price1, int32 expo1) = _decodeFeedFromBlob(lazer, fee, 1);
            PythResolver.BinaryOptionMarket memory market = PythResolver
                .BinaryOptionMarket({
                    priceId: bytes32(uint256(1)),
                    endTime: endTime,
                    strikePrice: price1 - 1,
                    strikeExpo: expo1,
                    overWinsOnTie: true
                });

            (bytes32 marketId, bool resolvedToOver) = resolver.settleMarket{
                value: fee
            }(market, updateData);
            assertTrue(resolvedToOver);

            (bool settled, , int64 storedPrice, int32 storedExpo, uint64 publishTime) = resolver
                .settlements(marketId);
            assertTrue(settled);
            assertEq(storedPrice, price1);
            assertEq(storedExpo, expo1);
            assertEq(publishTime, endTime);
        }

        // Market for feedId=2
        {
            (, int64 price2, int32 expo2) = _decodeFeedFromBlob(lazer, fee, 2);
            PythResolver.BinaryOptionMarket memory market = PythResolver
                .BinaryOptionMarket({
                    priceId: bytes32(uint256(2)),
                    endTime: endTime,
                    strikePrice: price2 - 1,
                    strikeExpo: expo2,
                    overWinsOnTie: true
                });

            (bytes32 marketId, bool resolvedToOver) = resolver.settleMarket{
                value: fee
            }(market, updateData);
            assertTrue(resolvedToOver);

            (bool settled, , int64 storedPrice, int32 storedExpo, uint64 publishTime) = resolver
                .settlements(marketId);
            assertTrue(settled);
            assertEq(storedPrice, price2);
            assertEq(storedExpo, expo2);
            assertEq(publishTime, endTime);
        }
    }
}


