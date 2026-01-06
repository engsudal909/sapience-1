// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title ConfigureTokenBridgePMSide
 * @notice Configure PM side bridge to trust SM side
 */
contract ConfigureTokenBridgePMSide is Script {
    function run() external {
        address pmBridge = vm.envAddress("PM_BRIDGE");
        address smBridge = vm.envAddress("SM_BRIDGE");
        uint32 smEid = uint32(vm.envUint("SM_EID"));

        vm.startBroadcast(vm.envUint("PM_PRIVATE_KEY"));
        TokenBridge pmBridgeContract = TokenBridge(payable(pmBridge));
        
        // Set peer for LayerZero
        pmBridgeContract.setPeer(smEid, bytes32(uint256(uint160(smBridge))));
        
        // Set bridge config
        pmBridgeContract.setBridgeConfig(
            BridgeTypes.BridgeConfig({
                remoteEid: smEid,
                remoteBridge: smBridge
            })
        );
        vm.stopBroadcast();

        console.log("PM Bridge configured:");
        console.log("  Remote EID:", smEid);
        console.log("  Remote Bridge:", smBridge);
    }
}

