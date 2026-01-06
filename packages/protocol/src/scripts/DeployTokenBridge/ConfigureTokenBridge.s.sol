// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title ConfigureTokenBridge
 * @notice Configure both PM and SM bridges to trust each other
 */
contract ConfigureTokenBridge is Script {
    function run() external {
        // PM side configuration
        address pmBridge = vm.envAddress("PM_BRIDGE");
        address smBridge = vm.envAddress("SM_BRIDGE");
        uint32 smEid = uint32(vm.envUint("SM_EID"));
        uint32 pmEid = uint32(vm.envUint("PM_EID"));

        // Configure PM bridge
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

        // Configure SM bridge
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

