// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/**
 * @title SetLzReadConfigScript
 * @notice Configure LayerZero executor and DVN for lzRead channel
 * @dev This configures the LayerZero endpoint for the read channel (Polygon)
 *      Similar to regular messaging config but for lzRead
 */
contract SetLzReadConfigScript is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    address constant ARB_LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One
    // Use the default message lib (SendUln302). Attempts to set ReadLib1002 as send library revert with LZ_UnsupportedEid().
    address constant SEND_LIB = 0x975bcD720be66659e3EB3C0e4F1866a3020E493A; // SendUln302 on Arbitrum
    address constant EXECUTOR = 0x31CAe3B7fB82d847621859fb1585353c5720660D; // Executor on Arbitrum
    // Use lzRead-specific DVN address (LayerZero Labs lzRead DVN for Arbitrum → Polygon)
    // Other options: Nethermind (0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd), Horizen (0x5cff49d69d79d677dd3e5b38e048a0dcb6d86aaf)
    address constant LZREAD_DVN = 0x1308151a7ebaC14f435d3Ad5fF95c34160D539A5; // LayerZero Labs lzRead DVN
    uint64 constant ULN_CONFIRMATIONS = 20;
    uint8 constant REQUIRED_DVN_COUNT = 1;
    uint32 constant MAX_MESSAGE_SIZE = 10000;

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address resolverAddr = RESOLVER;
        address endpoint = ARB_LZ_ENDPOINT;
        uint32 readChannelEid = READ_CHANNEL_EID;
        address sendLib = SEND_LIB;
        address executor = EXECUTOR;
        address dvn = LZREAD_DVN;
        uint64 confirmations = ULN_CONFIRMATIONS;
        uint8 requiredDvnCount = REQUIRED_DVN_COUNT;
        uint32 maxMessageSize = MAX_MESSAGE_SIZE;

        console.log("=== Configuring LayerZero for lzRead ===");
        console.log("Resolver:", resolverAddr);
        console.log("Endpoint:", endpoint);
        console.log("Read Channel EID (Polygon):", readChannelEid);
        console.log("Send Library:", sendLib);
        console.log("Executor:", executor);
        console.log("lzRead DVN:", dvn);
        console.log("NOTE: Using lzRead-specific DVN address (not regular messaging DVN)");

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        address oapp = resolverAddr;

        // Note: Send library is typically already configured at the endpoint level
        // We only need to configure executor and DVN settings
        console.log("Configuring executor and DVN (send library should already be set)");

        // Configure executor for read channel
        // Try with 0 required DVNs first (uses LayerZero defaults)
        // If that doesn't work, user can override with ARB_DVN env var
        UlnConfig memory uln;
        if (dvn != address(0) && requiredDvnCount > 0) {
            address[] memory requiredDVNs = new address[](1);
            requiredDVNs[0] = dvn;
            uln = UlnConfig({
                confirmations: confirmations,
                requiredDVNCount: requiredDvnCount,
                optionalDVNCount: type(uint8).max,
                optionalDVNThreshold: 0,
                requiredDVNs: requiredDVNs,
                optionalDVNs: new address[](0)
            });
            console.log("Using explicit DVN:", dvn);
        } else {
            // Use defaults (0 required DVNs)
            uln = UlnConfig({
                confirmations: confirmations,
                requiredDVNCount: 0,
                optionalDVNCount: type(uint8).max,
                optionalDVNThreshold: 0,
                requiredDVNs: new address[](0),
                optionalDVNs: new address[](0)
            });
            console.log("Using default DVN configuration (0 required)");
        }

        ExecutorConfig memory exec = ExecutorConfig({
            maxMessageSize: maxMessageSize,
            executor: executor
        });

        bytes memory encodedUln = abi.encode(uln);
        bytes memory encodedExec = abi.encode(exec);

        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(readChannelEid, EXECUTOR_CONFIG_TYPE, encodedExec);
        params[1] = SetConfigParam(readChannelEid, ULN_CONFIG_TYPE, encodedUln);

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, sendLib, params);
        console.log("Executor and DVN config set for read channel");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("LayerZero is now configured for lzRead to Polygon");
    }
}

