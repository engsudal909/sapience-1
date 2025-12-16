// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";

/**
 * @title ConfigureResolverScript
 * @notice Configure the resolver with peer for read channel
 * @dev For lzRead, the peer is set to the resolver itself (self-read)
 *      Run this after deployment and before requesting resolution
 */
contract ConfigureResolverScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One
    uint32 constant POLYGON_EID = 30109; // Polygon
    address constant POLYGON_CTF = 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045; // Polygon ConditionalTokens
    uint256 constant MAX_PREDICTION_MARKETS = 10;
    uint16 constant CONFIRMATIONS = 15;
    uint128 constant LZ_READ_GAS = 200_000;
    uint32 constant LZ_READ_RESULT_SIZE = 32;

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address resolverAddr = RESOLVER;
        uint32 readChannelEid = READ_CHANNEL_EID;

        PredictionMarketLZConditionalTokensResolver resolver = 
            PredictionMarketLZConditionalTokensResolver(payable(resolverAddr));

        // All config values are hardcoded
        uint32 polygonEid = POLYGON_EID;
        address polygonCtf = POLYGON_CTF;
        uint256 maxMarkets = MAX_PREDICTION_MARKETS;
        uint16 confirmations = CONFIRMATIONS;
        uint128 lzReadGas = LZ_READ_GAS;
        uint32 lzReadResultSize = LZ_READ_RESULT_SIZE;

        console.log("=== Configuring Resolver ===");
        console.log("Resolver:", resolverAddr);
        console.log("Read Channel EID:", readChannelEid);
        console.log("Target EID (Polygon):", polygonEid);

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        // Update config to ensure readChannelEid is correct (in case it was wrong at deployment)
        resolver.setConfig(PredictionMarketLZConditionalTokensResolver.Settings({
            maxPredictionMarkets: maxMarkets,
            readChannelEid: readChannelEid,
            targetEid: polygonEid,
            conditionalTokens: polygonCtf,
            confirmations: confirmations,
            lzReadGasLimit: lzReadGas,
            lzReadResultSize: lzReadResultSize
        }));
        console.log("Config updated");

        // Set peer for read channel - for lzRead, peer is the resolver itself
        bytes32 peerResolver = bytes32(uint256(uint160(resolverAddr)));
        resolver.setPeer(readChannelEid, peerResolver);
        console.log("Peer set for read channel:", vm.toString(peerResolver));

        // Enable the read channel
        resolver.setReadChannel(readChannelEid, true);
        console.log("Read channel enabled");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Resolver is now ready for lzRead requests.");
    }
}

