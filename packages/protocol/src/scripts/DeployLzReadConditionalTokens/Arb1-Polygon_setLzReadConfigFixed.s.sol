// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/**
 * @title SetLzReadConfigFixedScript
 * @notice Fixed LayerZero configuration for lzRead - uses address(0) executor to rely on defaults
 * @dev For lzRead, the executor is specified in the options via addExecutorLzReadOption,
 *      so we may not need explicit executor config. This script sets executor to address(0)
 *      to use LayerZero's default executor infrastructure.
 *      
 *      Key insight: lzRead executor is specified per-request in options, not via setConfig.
 *      However, we still need to configure ULN (DVN) settings for the read channel.
 */
contract SetLzReadConfigFixedScript is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    address constant ARB_LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One
    // Use the default message lib (SendUln302). Attempts to set ReadLib1002 as send library revert with LZ_UnsupportedEid().
    address constant SEND_LIB = 0x975bcD720be66659e3EB3C0e4F1866a3020E493A; // SendUln302 on Arbitrum
    // Optional lzRead DVN - set to address(0) to use LayerZero defaults (0 required DVNs)
    address constant LZREAD_DVN = address(0); // No DVN - use LayerZero defaults
    uint8 constant REQUIRED_DVN_COUNT = 0; // No DVN required
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

        console.log("=== Fixed LayerZero Configuration for lzRead ===");
        console.log("Resolver:", resolverAddr);
        console.log("Endpoint:", endpoint);
        console.log("Read Channel EID (Polygon):", readChannelEid);
        console.log("Send Library:", sendLib);
        console.log("");
        console.log("NOTE: Setting executor to address(0) to use LayerZero defaults.");
        console.log("      The executor for lzRead is specified in options via addExecutorLzReadOption.");

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        address oapp = resolverAddr;

        // Configure ULN (DVN settings)
        // For lzRead, we can use lzRead-specific DVNs if provided, otherwise use LayerZero defaults
        UlnConfig memory uln;
        if (lzReadDvn != address(0) && requiredDvnCount > 0) {
            address[] memory requiredDVNs = new address[](1);
            requiredDVNs[0] = lzReadDvn;
            uln = UlnConfig({
                confirmations: confirmations,
                requiredDVNCount: requiredDvnCount,
                optionalDVNCount: type(uint8).max,
                optionalDVNThreshold: 0,
                requiredDVNs: requiredDVNs,
                optionalDVNs: new address[](0)
            });
            console.log("Using lzRead DVN:", lzReadDvn);
        } else {
            uln = UlnConfig({
                confirmations: confirmations,
                requiredDVNCount: 0,  // No DVNs - use LayerZero defaults
                optionalDVNCount: type(uint8).max,
                optionalDVNThreshold: 0,
                requiredDVNs: new address[](0),
                optionalDVNs: new address[](0)
            });
            console.log("Using LayerZero default DVN configuration (0 required)");
        }

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
        if (lzReadDvn != address(0) && requiredDvnCount > 0) {
            console.log("Configuration set for read channel (executor: default, lzRead DVN: configured)");
        } else {
            console.log("Configuration set for read channel (executor: default, DVN: none)");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Fixed Configuration Complete ===");
        console.log("Executor set to address(0) to use LayerZero defaults.");
        if (lzReadDvn != address(0) && requiredDvnCount > 0) {
            console.log("ULN config set with lzRead DVN:", lzReadDvn);
        } else {
            console.log("ULN config set with 0 required DVNs (using LayerZero defaults).");
        }
        console.log("");
        console.log("Next step: Test fee quoting with:");
        console.log("  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \\");
        console.log("    --rpc-url $ARB_RPC");
    }
}


