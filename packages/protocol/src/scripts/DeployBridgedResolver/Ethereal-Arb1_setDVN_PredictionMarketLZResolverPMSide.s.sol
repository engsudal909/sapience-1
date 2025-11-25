// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolver} from "../../predictionMarket/resolvers/PredictionMarketLZResolver.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";

// Configure the PM-side LZ resolver on Ethereal to trust UMA-side peer and set gas params
contract ConfigurePredictionMarketLZResolver is Script {
    uint32 constant RECEIVE_CONFIG_TYPE = 2;

    function run() external {
        // Read from environment:
        //   PM_LZ_RESOLVER   - Deployed PredictionMarketLZResolver on Ethereal
        //   UMA_SIDE_RESOLVER - Deployed PredictionMarketLZResolverUmaSide on Arbitrum
        //   UMA_SIDE_EID     - Arbitrum One eid (e.g., 30110)
        address umaSideResolver = 0x070Bd542474390c3AFED2DAE85C2d13932c75F17;
        address pmLzResolver = 0xC873efA9D22A09e39101efB977C03011620bF015;
        uint32 umaSideEid = 30110;

        uint32 AEid = 30110;         // Source chain EID
        uint32 BEid = 30391;         // Destination chain EID
        uint32 gracePeriod = 0; // Grace period for library switch

        // Library addresses
        address sendLib = 0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7;    // SendUln302 address on A
        address receiveLib = 0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043; // ReceiveUln302 address on A

        address endpoint = 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B;      // Chain B Endpoint
        address oapp      = pmLzResolver;         // OApp on Chain B
        uint32 eid        = AEid;      // Endpoint ID for Chain A


        vm.startBroadcast(vm.envUint("ETHEREAL_PRIVATE_KEY"));

        // Set send library for outbound messages
        ILayerZeroEndpointV2(endpoint).setSendLibrary(
            oapp,    // OApp address
            AEid,  // Destination chain EID
            sendLib  // SendUln302 address
        );

        // Set receive library for inbound messages
        ILayerZeroEndpointV2(endpoint).setReceiveLibrary(
            oapp,        // OApp address
            AEid,      // Source chain EID
            receiveLib,  // ReceiveUln302 address
            gracePeriod  // Grace period for library switch
        );

        /// @notice UlnConfig controls verification threshold for incoming messages from A to B
        /// @notice Receive config enforces these settings have been applied to the DVNs for messages received from A
        /// @dev 0 values will be interpretted as defaults, so to apply NIL settings, use:
        /// @dev uint8 internal constant NIL_DVN_COUNT = type(uint8).max;
        /// @dev uint64 internal constant NIL_CONFIRMATIONS = type(uint64).max;
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = address(0x282b3386571f7f794450d5789911a9804FA346b4); // 0x6788f52439ACA6BFF597d3eeC2DC9a44B8FEE842
        address[] memory optionalDVNs = new address[](0);
        UlnConfig memory uln = UlnConfig({
            confirmations:      20,                                       // min block confirmations from source (A)
            requiredDVNCount:   1,                                        // required DVNs for message acceptance
            optionalDVNCount:   type(uint8).max,                          // optional DVNs count
            optionalDVNThreshold: 0,                                      // optional DVN threshold
            requiredDVNs:       requiredDVNs, // sorted required DVNs
            optionalDVNs:       optionalDVNs                                        // no optional DVNs
        });

        bytes memory encodedUln = abi.encode(uln);

        SetConfigParam[] memory params = new SetConfigParam[](1);
        params[0] = SetConfigParam(eid, RECEIVE_CONFIG_TYPE, encodedUln);

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, receiveLib, params); // Set config for messages received on B from A
        vm.stopBroadcast();
    }
}


