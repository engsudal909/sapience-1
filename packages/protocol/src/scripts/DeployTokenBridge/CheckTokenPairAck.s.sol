// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";
import {TokenBridgeTypes} from "../../bridge/TokenBridgeTypes.sol";

/**
 * @title CheckTokenPairAck
 * @notice Check if token pair is acknowledged on both sides
 * @dev Returns 0 if not acknowledged, 1 if acknowledged on PM side only, 2 if acknowledged on both sides
 */
contract CheckTokenPairAck is Script {
    function run() external returns (uint256) {
        address pmBridge = vm.envAddress("PM_BRIDGE");
        address smBridge = vm.envAddress("SM_BRIDGE");
        address tokenAddress = vm.envOr("TEST_TOKEN_ADDRESS", address(0));
        
        if (tokenAddress == address(0)) {
            return 0; // Token address not set
        }
        
        TokenBridge pmBridgeContract = TokenBridge(payable(pmBridge));
        TokenBridge smBridgeContract = TokenBridge(payable(smBridge));

        TokenBridgeTypes.TokenPair memory pmPair = pmBridgeContract.getTokenPair(tokenAddress);
        TokenBridgeTypes.TokenPair memory smPair = smBridgeContract.getTokenPair(tokenAddress);
        
        if (!pmPair.exists) {
            return 0; // Token pair doesn't exist on PM side
        }
        
        if (!smPair.exists) {
            return 1; // Token pair exists on PM but not on SM (waiting for LayerZero)
        }
        
        if (pmPair.acknowledged && smPair.acknowledged) {
            return 2; // Fully acknowledged on both sides
        }
        
        return 1; // Partially acknowledged
    }
}

