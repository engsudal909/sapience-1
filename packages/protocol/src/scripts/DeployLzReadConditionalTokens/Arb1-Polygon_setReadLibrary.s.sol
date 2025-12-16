// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/**
 * @title SetReadLibraryScript
 * @notice Configure the Read Library for lzRead operations
 * @dev For lzRead, we need to set the Read Library (ReadLib1002) as the send library
 *      for the read channel. This is different from regular messaging.
 *      
 *      Based on LayerZero documentation:
 *      - Read Library for Arbitrum One: 0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf (ReadLib1002)
 *      - This should be set as the send library for the read channel EID (destination chain)
 */
contract SetReadLibraryScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    address constant ARB_LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    // lzRead "readChannelEid" is the _lzSend destination EID. For Arbitrum-origin lzRead, this is Arbitrum's EID.
    uint32 constant READ_CHANNEL_EID = 30110; // Arbitrum One
    // Read Library (ReadLib1002) for Arbitrum One
    address constant READ_LIB = 0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf;

    function run() external {
        // All values are hardcoded - only ARB_PRIVATE_KEY needed from env for broadcasting
        address resolverAddr = RESOLVER;
        address endpoint = ARB_LZ_ENDPOINT;
        uint32 readChannelEid = READ_CHANNEL_EID;
        address readLib = READ_LIB;

        console.log("=== Setting Read Library for lzRead ===");
        console.log("Resolver:", resolverAddr);
        console.log("Endpoint:", endpoint);
        console.log("Read Channel EID (Polygon):", readChannelEid);
        console.log("Read Library (ReadLib1002):", readLib);
        console.log("");
        console.log("NOTE: For lzRead, the Read Library is set as the send library");
        console.log("      for the read channel (destination chain EID).");

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        address oapp = resolverAddr;

        // Set the Read Library as the send library for the read channel
        // This is the key difference for lzRead - we use ReadLib1002 instead of SendUln302
        ILayerZeroEndpointV2(endpoint).setSendLibrary(
            oapp,
            readChannelEid,  // Destination chain EID (Polygon)
            readLib           // Read Library (ReadLib1002)
        );
        
        console.log("Read Library set as send library for read channel");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Read Library Configuration Complete ===");
        console.log("Read Library (ReadLib1002) is now configured for lzRead.");
        console.log("");
        console.log("Next step: Configure executor and DVN with:");
        console.log("  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfig.s.sol \\");
        console.log("    --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY");
    }
}


