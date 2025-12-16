// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/**
 * @title SetLzReadConfigWithDvnScript
 * @notice Recommended LayerZero configuration for lzRead with lzRead-specific DVN
 * @dev This script configures lzRead with:
 *      - Executor set to address(0) to use LayerZero defaults
 *      - lzRead-specific DVN configured (LayerZero Labs by default)
 *      
 *      This is the RECOMMENDED approach based on research findings that lzRead
 *      requires lzRead-specific DVN addresses, not regular messaging DVN addresses.
 *      
 *      Available lzRead DVNs for Arbitrum → Polygon:
 *      - LayerZero Labs (recommended): 0x1308151a7ebac14f435d3ad5ff95c34160d539a5
 *      - Nethermind: 0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd
 *      - Horizen: 0x5cff49d69d79d677dd3e5b38e048a0dcb6d86aaf
 *      - BCW Group: 0x05ce650134d943c5e336dc7990e84fb4e69fdf29
 *      - AltLayer: 0x8ede21203e062d7d1eaec11c4c72ad04cdc15658
 *      - Nocturnal Labs: 0xfdd2e77a6addc1e18862f43297500d2ebfbd94ac
 */
contract SetLzReadConfigWithDvnScript is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    address constant ARB_LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One
    // Use the default message lib (SendUln302). Attempts to set ReadLib1002 as send library revert with LZ_UnsupportedEid().
    address constant SEND_LIB = 0x975bcD720be66659e3EB3C0e4F1866a3020E493A; // SendUln302 on Arbitrum
    address constant LZREAD_DVN = 0x1308151a7ebaC14f435d3Ad5fF95c34160D539A5; // LayerZero Labs lzRead DVN
    uint8 constant REQUIRED_DVN_COUNT = 1;
    uint64 constant ULN_CONFIRMATIONS = 20;
    uint32 constant MAX_MESSAGE_SIZE = 10000;

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address resolverAddr = RESOLVER;
        address endpoint = ARB_LZ_ENDPOINT;
        uint32 readChannelEid = READ_CHANNEL_EID;
        address sendLib = SEND_LIB;
        address lzReadDvn = LZREAD_DVN;
        uint8 requiredDvnCount = REQUIRED_DVN_COUNT;
        uint64 confirmations = ULN_CONFIRMATIONS;
        uint32 maxMessageSize = MAX_MESSAGE_SIZE;

        console.log("=== Recommended LayerZero Configuration for lzRead ===");
        console.log("Resolver:", resolverAddr);
        console.log("Endpoint:", endpoint);
        console.log("Read Channel EID (Polygon):", readChannelEid);
        console.log("Send Library:", sendLib);
        console.log("lzRead DVN:", lzReadDvn);
        console.log("Required DVN Count:", requiredDvnCount);
        console.log("");
        console.log("NOTE: Using lzRead-specific DVN (not regular messaging DVN)");
        console.log("      Executor set to address(0) to use LayerZero defaults.");

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        address oapp = resolverAddr;

        // Configure ULN with lzRead-specific DVN
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = lzReadDvn;
        UlnConfig memory uln = UlnConfig({
            confirmations: confirmations,
            requiredDVNCount: requiredDvnCount,
            optionalDVNCount: type(uint8).max,
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: new address[](0)
        });

        // Set executor to address(0) to use LayerZero's default executor
        // The actual executor for lzRead is specified in the options when calling _lzSend
        ExecutorConfig memory exec = ExecutorConfig({
            maxMessageSize: maxMessageSize,
            executor: address(0)  // Use default executor
        });

        bytes memory encodedUln = abi.encode(uln);
        bytes memory encodedExec = abi.encode(exec);

        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(readChannelEid, EXECUTOR_CONFIG_TYPE, encodedExec);
        params[1] = SetConfigParam(readChannelEid, ULN_CONFIG_TYPE, encodedUln);

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, sendLib, params);
        console.log("Configuration set for read channel (executor: default, lzRead DVN: configured)");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Executor set to address(0) to use LayerZero defaults.");
        console.log("lzRead DVN configured:", lzReadDvn);
        console.log("");
        console.log("Next step: Test fee quoting with:");
        console.log("  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \\");
        console.log("    --rpc-url $ARB_RPC");
    }
}

