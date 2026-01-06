// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";

/**
 * @title DeployTokenBridgeSMSide
 * @notice Deploy TokenBridge on SM (Secondary Market) side
 */
contract DeployTokenBridgeSMSide is Script {
    function run() external {
        // Load from environment
        address endpoint = vm.envAddress("SM_LZ_ENDPOINT");
        address owner = vm.envAddress("SM_OWNER");

        vm.startBroadcast(vm.envUint("SM_PRIVATE_KEY"));
        TokenBridge bridge = new TokenBridge(endpoint, owner, false); // false = SM side
        vm.stopBroadcast();

        console.log("TokenBridge (SM Side) deployed to:", address(bridge));
        console.log("Owner:", owner);
        console.log("LayerZero Endpoint:", endpoint);
    }
}

