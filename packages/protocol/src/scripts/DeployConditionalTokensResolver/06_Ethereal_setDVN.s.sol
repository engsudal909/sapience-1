// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";

/**
 * @title SetDVNForEtherealResolver
 * @notice Configure LayerZero DVNs, libraries, and confirmations for Ethereal Resolver
 * @dev This configures the RECEIVE side (Polygon → Ethereal):
 *      - Receive library
 *      - Receive DVNs and confirmations
 *      
 *      Required env vars:
 *      - ETHEREAL_CONDITIONAL_TOKENS_RESOLVER: Deployed Resolver address
 *      - ETHEREAL_LZ_ENDPOINT: LayerZero endpoint on Ethereal
 *      - ETHEREAL_RECEIVE_LIB: Receive library address on Ethereal
 *      - ETHEREAL_DVN: Required DVN address on Ethereal
 *      - POLYGON_EID: Source chain EID (Polygon)
 *      
 *      Optional env vars:
 *      - ULN_CONFIRMATIONS: Block confirmations (default: 20)
 *      - REQUIRED_DVN_COUNT: Required DVN count (default: 1)
 *      - GRACE_PERIOD: Grace period for library switch (default: 0)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/06_Ethereal_setDVN.s.sol \
 *        --rpc-url $ETHEREAL_RPC --broadcast --private-key $ETHEREAL_PRIVATE_KEY
 */
contract SetDVNForEtherealResolver is Script {
    uint32 constant RECEIVE_CONFIG_TYPE = 2;

    function run() external {
        address resolver = 0xC304B7052B385A631dfcC4d97206a12A346cddAd;
        address endpoint = 0x1a44076050125825900e736c501f859c50fE728c;
        address receiveLib = 0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6;
        // address dvn = vm.envAddress("ETHEREAL_DVN");
        address dvn1 = 0x23DE2FE932d9043291f870324B74F820e11dc81A;
        address dvn2 = 0xD56e4eAb23cb81f43168F9F45211Eb027b9aC7cc;
        uint32 polygonEid = uint32(30109);
        // address resolver = vm.envAddress("ETHEREAL_CONDITIONAL_TOKENS_RESOLVER");
        // address endpoint = vm.envAddress("ETHEREAL_LZ_ENDPOINT");
        // address receiveLib = vm.envAddress("ETHEREAL_RECEIVE_LIB");
        // address dvn = vm.envAddress("ETHEREAL_DVN");
        // uint32 polygonEid = uint32(vm.envUint("POLYGON_EID"));
        
        uint64 confirmations = uint64(20);
        uint8 requiredDvnCount = uint8(2);
        uint32 gracePeriod = uint32(0);
        // uint64 confirmations = uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(20)));
        // uint8 requiredDvnCount = uint8(vm.envOr("REQUIRED_DVN_COUNT", uint256(1)));
        // uint32 gracePeriod = uint32(vm.envOr("GRACE_PERIOD", uint256(0)));

        console.log("=== Configuring LayerZero DVN for Ethereal Resolver (RECEIVE) ===");
        console.log("Resolver:", resolver);
        console.log("Endpoint:", endpoint);
        console.log("Receive Library:", receiveLib);
        console.log("DVN1:", dvn1);
        console.log("DVN2:", dvn2);
        console.log("Source EID (Polygon):", polygonEid);
        console.log("Confirmations:", confirmations);
        console.log("Required DVN Count:", requiredDvnCount);
        console.log("");

        vm.startBroadcast();

        address oapp = resolver;

        // Set receive library for inbound messages (Polygon → Ethereal)
        console.log("Setting receive library...");
        ILayerZeroEndpointV2(endpoint).setReceiveLibrary(
            oapp,
            polygonEid,  // Source chain EID
            receiveLib,
            gracePeriod
        );
        console.log("Receive library set");

        // Configure ULN (DVNs + confirmations) for receiving
        address[] memory requiredDVNs = new address[](2);
            requiredDVNs[0] = dvn1;
        requiredDVNs[1] = dvn2;
        UlnConfig memory uln = UlnConfig({
            confirmations: confirmations,           // Block confirmations required from source
            requiredDVNCount: requiredDvnCount,     // Number of required DVNs
            optionalDVNCount: type(uint8).max,     // No optional DVNs
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: new address[](0)
        });

        bytes memory encodedUln = abi.encode(uln);

        SetConfigParam[] memory params = new SetConfigParam[](1);
        params[0] = SetConfigParam(polygonEid, RECEIVE_CONFIG_TYPE, encodedUln);

        console.log("Setting receive config (DVN)...");
        ILayerZeroEndpointV2(endpoint).setConfig(oapp, receiveLib, params);
        console.log("Receive config set");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Ethereal resolver is now configured to receive messages from Polygon");
        console.log("Both sides are now fully configured for cross-chain communication");
        console.log("Next step: Run script 07_Polygon_testFlow.s.sol to test the flow");
    }
}

