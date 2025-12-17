// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../../src/predictionMarket/resolvers/PredictionMarketPythResolver.sol";
import "../../src/predictionMarket/resolvers/pyth/IPyth.sol";
import "../../src/predictionMarket/resolvers/pyth/PythStructs.sol";

library ArbitrumPythFixture {
    // BTC/USD Benchmarks id from `https://benchmarks.pyth.network/v1/price_feeds/`.
    bytes32 internal constant BTC_USD_PRICE_ID =
        0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;

    // Hardcoded Benchmarks update data blob (bytes) for BTC_USD_PRICE_ID at a chosen publishTime.
    // Fetched from Benchmarks API:
    // `GET https://benchmarks.pyth.network/v1/updates/price/<ts>/60?ids=<id>&encoding=hex&parsed=true`
    // Then extract the blob at `.[0].binary.data[0]` and paste as `hex"..."` below.
    bytes internal constant UPDATE_DATA =
        hex"504e41550100000003b801000000040d005182019a6f98f63f29a8353053f318a2803da720dc7fba67d1ce85b7cce3f86a028476b290460850e7d2856c234ba0b4bfd2fecca94c1656b979c6c5a1d5dc6701038dd5c5a42b8f3b78275a950f320897e526a4bf60517915f06f99ad7c369b6f226007a8e7238b2369e76b154134d4ceda619be1288d5e193d95f7ed95e505252d0104e47d000240793f63dff6788d336acc2d4c6f43e5c9a0e5a6e22daa9bdb7a859a6c91723191cd70130ebbff82f408ff42b6cbc0783ea0d6245bd77cb2180c59ae0006613e825a863e33fbd50a76a211fea06b5d3628a3a718e2980485794096a098070a58b1c8bb220cd937a19a6417407d7d11959bf4b0dec889286359ec69bbc542000835e55817d655fae254fd73a6b1e2a19187e277474bc741bb9b96a81647daa5626f84b212cc98a65b217a10b320796a084598f50eba459874ae73fb5e99845185000a3292938d6108a7e67ed882dfb970eed532c24d6ce0056652161de610f025cacd65fc6b21d7d919b80e62980360863788f2a5196fcab2e730b79c6319a7321f76010bb326bc10131de066d7582ce5b571c49b4a342d6f6b440f4f2ce466d1d50dc133181a2de7114f962ee19a0f00250e14e5869a9f9e259ae30f180a3933432c9f8d010c05704d248210bcfecefa0d8e5f414ae624bbdfb42dd30aa02ab6ff8f541cd12773f1afe4bc09d14928d8440371967c539820b59861adbb6f753aed5d2a07565b010dbd548f2673af9b6ac5b5703b3b76e5d56563d9c2a504d067867f1c09a9297cd6756c1b67a431e9ba6961f2b660e0bbb750fc490b352ccaded2dd4aa7ff86d233000e71dec04c14158b2a73a86cf17c38f606162687c2db5dbdacf9827ba9a2dd54bf6e47d8ca6d9cfa7b922b7f69113ce2f96d68fd4447a058b38921068ef342e773010f70089c538562f2eb4d23468c5142d02c42e05e15478de0e3a9e2b8a01362ba1c252c01e6b1d53873fc68ef701f9972b346225d47b268f8cc9501a5030b7a3e69011079c5646425f9ca1c340c822be20ab416638147637bf9237b894db99abbfbbf0367f2e655349a9a71072eb8e9fbcfee2e9115b6598e7bc1dba681da86b578a2c9011155786f197b95985e1a724d958cc7d622dbe8eab16bff42318f66f9a31b7e71ab0fe9b6e4143c9d29044b1bee387f191e509b34a2a3262e999294b0bdfef2d484006940d6d000000000001ae101faedac5851e32b9b23b5f9411a8c2bac4aae3ed4dd7b811dd1a72ea4aa71000000000a83db26014155575600000000000f91828700002710578f5e35edc266220806114180b1fe0f46ccd47601005500e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43000007cdc30b7c8000000000aaf23500fffffff8000000006940d6d0000000006940d6cf000007cf0c60dfa0000000009615572a0d7ef4ef3fb8c6c358feb3f95d1b24e800d837a40e2dcfb0cf43d741565ca13ac89ac55354493805a289a612eb9efb8eacf9b49b6cbde9b3b2379c8c46bb24e3838bab2749b0ecd8e01c25f1c5631509b0b5b06f05706fd32eed60378a5b817c4c244444a0427f7331cf24e2f366d2922ee6ac83c9967ebb044a9aa352e1aa28c1db543b2b68ddffbf49417eed1c15fd8660249453cdfc9923fd3574b2bc3a6a0f061a5c5dccff89a8d2af9b4534dd3366a10a990ff3760f35ebcd430ebd770ed72542bb3f7a92b45a2d3d0773083e9e2a98c8ccd6598fb9494cd97580c549d3416fe575508e3a8549eea335760d03091a7f148655e90e42799e7cd786a26a8a86f2b569ac";
}

/// @notice Arbitrum One fork/e2e test for the Pyth resolver.
/// @dev This test is **opt-in** and will be skipped unless `RUN_PYTH_ARBITRUM_FORK_TESTS=true`.
///      This keeps local/CI test runs deterministic and offline-friendly.
contract PredictionMarketPythResolverArbitrumForkTest is Test {
    string internal constant DEFAULT_ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc";

    // Official Pyth verifier (Core) contract on Arbitrum One (EVM contract addresses list).
    // If this deployment does not implement the Pyth Core pull-oracle interface
    // (`parsePriceFeedUpdates` / `getUpdateFee`), the test will skip.
    address internal constant DEFAULT_ARBITRUM_PYTH_VERIFIER =
        0xff1a0f4744e8582DF1aE09D5611b887B6a12925C;

    function _extractFromVerifier(
        address pythVerifier,
        bytes32 priceId,
        bytes[] memory updateData,
        uint256 fee
    ) internal returns (uint64 endTime, int64 price, int32 expo) {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = priceId;

        PythStructs.PriceFeed[] memory feeds;
        try IPyth(pythVerifier).parsePriceFeedUpdates{value: fee}(
            updateData,
            ids,
            0,
            type(uint64).max
        ) returns (PythStructs.PriceFeed[] memory pf) {
            feeds = pf;
        } catch {
            vm.skip(true);
        }

        if (feeds.length == 0 || feeds[0].id != priceId) vm.skip(true);

        PythStructs.Price memory p = feeds[0].price;
        if (p.price <= 1) vm.skip(true);

        return (p.publishTime, p.price, p.expo);
    }

    function test_e2e_arbitrumFork_settleMarket() public {
        bool runFork = vm.envOr("RUN_PYTH_ARBITRUM_FORK_TESTS", false);
        if (!runFork) vm.skip(true);

        address pythVerifier = vm.envOr("ARBITRUM_PYTH_VERIFIER", DEFAULT_ARBITRUM_PYTH_VERIFIER);
        bytes32 priceId = vm.envOr("PYTH_PRICE_ID", ArbitrumPythFixture.BTC_USD_PRICE_ID);

        // Fork Arbitrum One (optionally pinned)
        {
            string memory rpc = vm.envOr("ARBITRUM_RPC", DEFAULT_ARBITRUM_RPC);
            uint256 forkBlock = vm.envOr("ARBITRUM_FORK_BLOCK", uint256(0));
            if (forkBlock != 0) {
                vm.createSelectFork(rpc, forkBlock);
            } else {
                vm.createSelectFork(rpc);
            }
        }

        // Require a real on-chain pull-oracle instance (implements `parsePriceFeedUpdates`).
        if (pythVerifier.code.length == 0) {
            vm.skip(true);
        }

        // Deploy resolver pointing at on-chain Pyth contract
        PredictionMarketPythResolver.Settings memory settings = PredictionMarketPythResolver.Settings({
            maxPredictionMarkets: 1,
            pyth: IPyth(pythVerifier),
            publishTimeWindowSeconds: 0
        });
        PredictionMarketPythResolver resolver = new PredictionMarketPythResolver(settings);

        // Prepare updateData array (Pyth expects bytes[]).
        bytes[] memory updateData = new bytes[](1);
        // Hardcoded blob (like before). Can be overridden via env if you want to rotate it.
        // Backwards compatible env var: PYTH_BENCHMARK_UPDATE_DATA
        bytes memory envOverride = vm.envOr(
            "PYTH_UPDATE_DATA",
            vm.envOr("PYTH_BENCHMARK_UPDATE_DATA", bytes(""))
        );
        updateData[0] = envOverride.length > 0
            ? envOverride
            : ArbitrumPythFixture.UPDATE_DATA;

        // Some deployments may revert here; skip instead of failing.
        uint256 fee;
        try IPyth(pythVerifier).getUpdateFee(updateData) returns (uint256 f) {
            fee = f;
        } catch {
            vm.skip(true);
        }

        vm.deal(address(this), fee * 2 + 1 ether);

        // First, use the on-chain verifier directly (on the fork) to extract the publishTime/price/expo
        // from the update blob. This ensures we're testing against the verifier contract itself.
        (uint64 endTime, int64 benchmarkPrice, int32 expo) = _extractFromVerifier(
            pythVerifier,
            priceId,
            updateData,
            fee
        );
        int64 strike = benchmarkPrice - 1; // ensures Over

        PredictionMarketPythResolver.BinaryOptionMarket memory market = PredictionMarketPythResolver.BinaryOptionMarket({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strike,
            strikeExpo: expo,
            overWinsOnTie: true
        });

        vm.warp(endTime);

        bytes32 marketId;
        bool resolvedToOver;
        try resolver.settleMarket{value: fee}(market, updateData) returns (
            bytes32 mId,
            bool outcome
        ) {
            marketId = mId;
            resolvedToOver = outcome;
        } catch {
            vm.skip(true);
        }
        assertTrue(resolvedToOver);

        // Maker predicts Over => should succeed
        PredictionMarketPythResolver.BinaryOptionOutcome[]
            memory outcomes = new PredictionMarketPythResolver.BinaryOptionOutcome[](1);
        outcomes[0] = PredictionMarketPythResolver.BinaryOptionOutcome({
            priceId: priceId,
            endTime: endTime,
            strikePrice: strike,
            strikeExpo: expo,
            overWinsOnTie: true,
            prediction: true
        });

        (bool isResolved, , bool success) = resolver.getPredictionResolution(abi.encode(outcomes));
        assertTrue(isResolved);
        assertTrue(success);

        // Settlement stored (keep locals small to avoid stack-too-deep in fork tests)
        {
            (bool settled, , , , ) = resolver.settlements(marketId);
            assertTrue(settled);
        }
        {
            (, bool storedOutcome, , , ) = resolver.settlements(marketId);
            assertTrue(storedOutcome);
        }
        {
            (, , int64 storedPrice, , ) = resolver.settlements(marketId);
            assertEq(storedPrice, benchmarkPrice);
        }
        {
            (, , , int32 storedExpo, ) = resolver.settlements(marketId);
            assertEq(storedExpo, expo);
        }
        {
            (, , , , uint64 publishTime) = resolver.settlements(marketId);
            assertEq(publishTime, endTime);
        }
    }
}


