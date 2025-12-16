// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";

/**
 * @title SetLzReadConfigMinimalScript
 * @notice Minimal LayerZero configuration for lzRead - only sets ULN config, no explicit executor
 * @dev This script tries to configure lzRead using LayerZero defaults for executor.
 *      Use this if the explicit executor configuration fails with fee calculation errors.
 *      LayerZero may have default executors configured at the endpoint level for lzRead.
 */
contract SetLzReadConfigMinimalScript is Script {
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

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address resolverAddr = RESOLVER;
        address endpoint = ARB_LZ_ENDPOINT;
        uint32 readChannelEid = READ_CHANNEL_EID;
        address sendLib = SEND_LIB;
        address lzReadDvn = LZREAD_DVN;
        uint8 requiredDvnCount = REQUIRED_DVN_COUNT;
        uint64 confirmations = ULN_CONFIRMATIONS;

        console.log("=== Minimal LayerZero Configuration for lzRead ===");
        console.log("Resolver:", resolverAddr);
        console.log("Endpoint:", endpoint);
        console.log("Read Channel EID (Polygon):", readChannelEid);
        console.log("Send Library:", sendLib);
        console.log("");
        console.log("NOTE: This script does NOT set executor configuration.");
        console.log("      For lzRead, the executor is specified in options via addExecutorLzReadOption.");
        console.log("      We only configure ULN (DVN) settings here.");

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        address oapp = resolverAddr;

        // Only configure ULN (DVN settings) - no executor config
        // Can use lzRead-specific DVNs if provided, otherwise use LayerZero defaults
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
                requiredDVNCount: 0,  // Use LayerZero defaults
                optionalDVNCount: type(uint8).max,
                optionalDVNThreshold: 0,
                requiredDVNs: new address[](0),
                optionalDVNs: new address[](0)
            });
            console.log("Using LayerZero default DVN configuration (0 required)");
        }

        bytes memory encodedUln = abi.encode(uln);

        SetConfigParam[] memory params = new SetConfigParam[](1);
        params[0] = SetConfigParam(readChannelEid, ULN_CONFIG_TYPE, encodedUln);

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, sendLib, params);
        console.log("ULN config set for read channel");
        console.log("Executor will be determined from options when calling _lzSend");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Minimal Configuration Complete ===");
        console.log("Only ULN config was set. Executor is specified in options per-request.");
        if (lzReadDvn != address(0) && requiredDvnCount > 0) {
            console.log("lzRead DVN configured:", lzReadDvn);
        } else {
            console.log("Using LayerZero default DVN configuration.");
        }
        console.log("");
        console.log("Next step: Try quoting fees with:");
        console.log("  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \\");
        console.log("    --rpc-url $ARB_RPC");
    }
}

