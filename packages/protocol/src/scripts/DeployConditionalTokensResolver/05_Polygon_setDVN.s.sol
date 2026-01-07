// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { SetConfigParam } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/**
 * @title SetDVNForPolygonReader
 * @notice Configure LayerZero DVNs, libraries, and confirmations for Polygon ConditionalTokensReader
 * @dev This configures the SEND side (Polygon → Ethereal):
 *      - Send library
 *      - Send DVNs and confirmations
 *      - Executor config
 *      
 *      Required env vars:
 *      - POLYGON_CONDITIONAL_TOKENS_READER: Deployed ConditionalTokensReader address
 *      - POLYGON_LZ_ENDPOINT: LayerZero endpoint on Polygon
 *      - POLYGON_SEND_LIB: Send library address on Polygon
 *      - POLYGON_DVN: Required DVN address on Polygon
 *      - POLYGON_EXECUTOR: Executor address on Polygon (or 0x0 for default)
 *      - ETHEREAL_EID: Destination chain EID (Ethereal)
 *      
 *      Optional env vars:
 *      - ULN_CONFIRMATIONS: Block confirmations (default: 20)
 *      - REQUIRED_DVN_COUNT: Required DVN count (default: 1)
 *      - MAX_MESSAGE_SIZE: Max message size (default: 10000)
 *      - GRACE_PERIOD: Grace period for library switch (default: 0)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/05_Polygon_setDVN.s.sol \
 *        --rpc-url $POLYGON_RPC --broadcast --private-key $POLYGON_PRIVATE_KEY
 */
contract SetDVNForPolygonReader is Script {
    uint32 constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 constant ULN_CONFIG_TYPE = 2;

    function run() external {
        // address reader = 0x26DB702647e56B230E15687bFbC48b526E131dAe;
        address endpoint = 0x1a44076050125825900e736c501f859c50fE728c;
        // address sendLib = 0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3;
        // address dvn1 = 0x23DE2FE932d9043291f870324B74F820e11dc81A;
        // address dvn2 = 0xD56e4eAb23cb81f43168F9F45211Eb027b9aC7cc;
        address executor = 0xCd3F213AD101472e1713C72B1697E727C803885b; 
        uint32 etherealEid = uint32(30110);
        // address reader = vm.envAddress("POLYGON_CONDITIONAL_TOKENS_READER");
        // address endpoint = vm.envAddress("POLYGON_LZ_ENDPOINT");
        // address sendLib = vm.envAddress("POLYGON_SEND_LIB");
        // address dvn = vm.envAddress("POLYGON_DVN");
        // address executor = vm.envOr("POLYGON_EXECUTOR", address(0)); // Default to 0x0 for LayerZero default
        // uint32 etherealEid = uint32(vm.envUint("ETHEREAL_EID"));
        
        uint64 confirmations = uint64(20);
        uint8 requiredDvnCount = uint8(2);
        uint32 maxMessageSize = uint32(10000);
        // uint32 gracePeriod = uint32(0);
        // uint64 confirmations = uint64(vm.envOr("ULN_CONFIRMATIONS", uint256(20)));
        // uint8 requiredDvnCount = uint8(vm.envOr("REQUIRED_DVN_COUNT", uint256(1)));
        // uint32 maxMessageSize = uint32(vm.envOr("MAX_MESSAGE_SIZE", uint256(10000)));
        // uint32 gracePeriod = uint32(vm.envOr("GRACE_PERIOD", uint256(0)));

        console.log("=== Configuring LayerZero DVN for Polygon Reader (SEND) ===");
        console.log("Reader:", 0x26DB702647e56B230E15687bFbC48b526E131dAe);
        console.log("Endpoint:", endpoint);
        console.log("Send Library:", 0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3);
        console.log("DVN1:", 0x23DE2FE932d9043291f870324B74F820e11dc81A);
        console.log("DVN2:", 0xD56e4eAb23cb81f43168F9F45211Eb027b9aC7cc);
        console.log("Executor:", executor == address(0) ? "0x0 (default)" : vm.toString(executor));
        console.log("Destination EID (Ethereal):", etherealEid);
        console.log("Confirmations:", confirmations);
        console.log("Required DVN Count:", requiredDvnCount);
        console.log("Max Message Size:", maxMessageSize);
        console.log("");

        // Hardcode private key or use --private-key flag
        // Option 1: Hardcode here (replace with your actual private key)
        // uint256 privateKey = 0xYOUR_PRIVATE_KEY_HERE;
        // vm.startBroadcast(privateKey);
        
        // Option 2: Use --private-key flag (recommended)
        // Run: forge script ... --private-key 0x... (no vm.envUint call needed)
        vm.startBroadcast();

        address oapp = 0x26DB702647e56B230E15687bFbC48b526E131dAe;

        // Set send library for outbound messages (Polygon → Ethereal)
        console.log("Setting send library...");
        ILayerZeroEndpointV2(endpoint).setSendLibrary(
            oapp,
            etherealEid,  // Destination chain EID
            0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3
        );
        console.log("Send library set");

        // Configure ULN (DVNs + confirmations) for sending
        address[] memory requiredDVNs = new address[](2);
        requiredDVNs[0] = 0x23DE2FE932d9043291f870324B74F820e11dc81A;
        requiredDVNs[1] = 0xD56e4eAb23cb81f43168F9F45211Eb027b9aC7cc;
        UlnConfig memory uln = UlnConfig({
            confirmations: confirmations,           // Block confirmations required before sending
            requiredDVNCount: requiredDvnCount,    // Number of required DVNs
            optionalDVNCount: type(uint8).max,     // No optional DVNs
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: new address[](0)
        });

        // Configure executor
        ExecutorConfig memory exec = ExecutorConfig({
            maxMessageSize: maxMessageSize,
            executor: executor  // address(0) uses LayerZero default executor
        });

        bytes memory encodedUln = abi.encode(uln);
        bytes memory encodedExec = abi.encode(exec);

        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(etherealEid, EXECUTOR_CONFIG_TYPE, encodedExec);
        params[1] = SetConfigParam(etherealEid, ULN_CONFIG_TYPE, encodedUln);

        console.log("Setting send config (executor + DVN)...");
        ILayerZeroEndpointV2(endpoint).setConfig(oapp, 0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3, params);
        console.log("Send config set");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("Polygon reader is now configured to send messages to Ethereal");
        console.log("Next step: Run script 06_Ethereal_setDVN.s.sol to configure receive side");
    }
}

