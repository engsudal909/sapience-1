// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title ConfigureTokenBridgeSMSide
 * @notice Configure SM side bridge to trust PM side
 */
contract ConfigureTokenBridgeSMSide is Script {
    function run() external {
        address pmBridge = vm.envAddress("PM_BRIDGE");
        address smBridge = vm.envAddress("SM_BRIDGE");
        uint32 pmEid = uint32(vm.envUint("PM_EID"));

        vm.startBroadcast(vm.envUint("SM_PRIVATE_KEY"));
        TokenBridge smBridgeContract = TokenBridge(payable(smBridge));
        
        // Set peer for LayerZero
        smBridgeContract.setPeer(pmEid, bytes32(uint256(uint160(pmBridge))));
        
        // Set bridge config
        smBridgeContract.setBridgeConfig(
            BridgeTypes.BridgeConfig({
                remoteEid: pmEid,
                remoteBridge: pmBridge
            })
        );
        vm.stopBroadcast();

        console.log("SM Bridge configured:");
        console.log("  Remote EID:", pmEid);
        console.log("  Remote Bridge:", pmBridge);
    }
}

