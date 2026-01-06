// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";

/**
 * @title DeployTokenBridgePMSide
 * @notice Deploy TokenBridge on PM (Prediction Market) side
 */
contract DeployTokenBridgePMSide is Script {
    function run() external {
        // Load from environment
        address endpoint = vm.envAddress("PM_LZ_ENDPOINT");
        address owner = vm.envAddress("PM_OWNER");

        vm.startBroadcast(vm.envUint("PM_PRIVATE_KEY"));
        TokenBridge bridge = new TokenBridge(endpoint, owner, true); // true = PM side
        vm.stopBroadcast();

        console.log("TokenBridge (PM Side) deployed to:", address(bridge));
        console.log("Owner:", owner);
        console.log("LayerZero Endpoint:", endpoint);
    }
}

