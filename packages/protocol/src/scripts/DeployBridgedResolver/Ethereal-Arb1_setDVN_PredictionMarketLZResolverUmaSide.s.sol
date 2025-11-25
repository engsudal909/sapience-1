// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZResolverUmaSide} from "../../predictionMarket/resolvers/PredictionMarketLZResolverUmaSide.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

// Configure the UMA-side resolver on Arbitrum to point to PM-side peer and UMA settings
contract ConfigurePredictionMarketLZResolverUmaSide is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;
    
    function run() external {
        // Read from environment:
        //   UMA_SIDE_RESOLVER - Deployed UMA-side resolver (Arbitrum)
        //   PM_LZ_RESOLVER    - Deployed PM-side resolver (Ethereal)
        //   PM_SIDE_EID       - Ethereal eid
        // Optional UMA params:
        //   UMA_OOV3, UMA_BOND_TOKEN, UMA_BOND_AMOUNT, UMA_ASSERTION_LIVENESS, UMA_ASSERTER
        address umaSideResolver = 0x070Bd542474390c3AFED2DAE85C2d13932c75F17;
        address pmLzResolver = 0xC873efA9D22A09e39101efB977C03011620bF015;
        // uint32 pmSideEid = uint32(vm.envUint("PM_SIDE_EID"));

        // Load environment variables
        address endpoint = 0x1a44076050125825900e736c501f859c50fE728c;    // LayerZero Endpoint address
        address oapp = umaSideResolver;           // Your OApp contract address
        // address signer = vm.envAddress("SIGNER");               // Address with permissions to configure

        // Library addresses
        address sendLib = 0x975bcD720be66659e3EB3C0e4F1866a3020E493A;    // SendUln302 address on A
        address receiveLib = 0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6; // ReceiveUln302 address on A

        // Chain configurations
        uint32 AEid = 30110;         // Source chain EID
        uint32 BEid = 30391;         // Destination chain EID
        uint32 gracePeriod = 0; // Grace period for library switch
        

        vm.startBroadcast(vm.envUint("ARB_PRIVATE_KEY"));

        // Set send library for outbound messages
        ILayerZeroEndpointV2(endpoint).setSendLibrary(
            oapp,    // OApp address
            BEid,  // Destination chain EID
            sendLib  // SendUln302 address
        );

        // Set receive library for inbound messages
        ILayerZeroEndpointV2(endpoint).setReceiveLibrary(
            oapp,        // OApp address
            AEid,      // Source chain EID
            receiveLib,  // ReceiveUln302 address
            gracePeriod  // Grace period for library switch
        );

        // Set executor config and EVM
        /// @notice ULNConfig defines security parameters (DVNs + confirmation threshold) for A → B
        /// @notice Send config requests these settings to be applied to the DVNs and Executor for messages sent from A to B
        /// @dev 0 values will be interpretted as defaults, so to apply NIL settings, use:
        /// @dev uint8 internal constant NIL_DVN_COUNT = type(uint8).max;
        /// @dev uint64 internal constant NIL_CONFIRMATIONS = type(uint64).max;
        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = address(0x2f55C492897526677C5B68fb199ea31E2c126416);// 0x2f55c492897526677c5b68fb199ea31e2c126416 // 0x758C419533ad64Ce9D3413BC8d3A97B026098EC1
        UlnConfig memory uln = UlnConfig({
            confirmations:        20,                                      // minimum block confirmations required on A before sending to B
            requiredDVNCount:     1,                                       // number of DVNs required
            optionalDVNCount:     type(uint8).max,                         // optional DVNs count, uint8
            optionalDVNThreshold: 0,                                       // optional DVN threshold
            requiredDVNs:        requiredDVNs, // sorted list of required DVN addresses
            optionalDVNs:        new address[](0)                                       // sorted list of optional DVNs
        });

        /// @notice ExecutorConfig sets message size limit + fee‑paying executor for A → B
        ExecutorConfig memory exec = ExecutorConfig({
            maxMessageSize: 10000,                                       // max bytes per cross-chain message
            executor:       address(0x31CAe3B7fB82d847621859fb1585353c5720660D)                           // address that pays destination execution fees on B
        });

        bytes memory encodedUln  = abi.encode(uln);
        bytes memory encodedExec = abi.encode(exec);


        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(BEid, EXECUTOR_CONFIG_TYPE, encodedExec);
        params[1] = SetConfigParam(BEid, ULN_CONFIG_TYPE, encodedUln);

        ILayerZeroEndpointV2(endpoint).setConfig(oapp, sendLib, params); // Set config for messages sent from A to B
        vm.stopBroadcast();
    }
}



