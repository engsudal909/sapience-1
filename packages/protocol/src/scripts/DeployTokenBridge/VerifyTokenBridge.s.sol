// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";
import {BridgeableToken} from "../../bridge/BridgeableToken.sol";
import {TokenBridgeTypes} from "../../bridge/TokenBridgeTypes.sol";
import {BridgeTypes} from "../../bridge/BridgeTypes.sol";

/**
 * @title VerifyTokenBridge
 * @notice Verify TokenBridge deployment and token pair status
 */
contract VerifyTokenBridge is Script {
    function run() external {
        address pmBridge = vm.envAddress("PM_BRIDGE");
        address smBridge = vm.envAddress("SM_BRIDGE");
        
        TokenBridge pmBridgeContract = TokenBridge(payable(pmBridge));
        TokenBridge smBridgeContract = TokenBridge(payable(smBridge));

        console.log("=== TokenBridge Verification ===");
        console.log("PM Bridge:", pmBridge);
        console.log("SM Bridge:", smBridge);

        // Test 1: Verify bridges are configured
        console.log("\n[Test 1] Checking bridge configuration...");
        BridgeTypes.BridgeConfig memory pmConfig = pmBridgeContract.getBridgeConfig();
        BridgeTypes.BridgeConfig memory smConfig = smBridgeContract.getBridgeConfig();
        
        console.log("PM Bridge Remote EID:", pmConfig.remoteEid);
        console.log("PM Bridge Remote Address:", pmConfig.remoteBridge);
        console.log("SM Bridge Remote EID:", smConfig.remoteEid);
        console.log("SM Bridge Remote Address:", smConfig.remoteBridge);

        require(pmConfig.remoteBridge == smBridge, "PM bridge not configured correctly");
        require(smConfig.remoteBridge == pmBridge, "SM bridge not configured correctly");
        console.log("✓ Bridge configuration verified");

        // Test 2: Verify token pair (if token address provided)
        address tokenAddress = vm.envOr("TEST_TOKEN_ADDRESS", address(0));
        if (tokenAddress != address(0)) {
            console.log("\n[Test 2] Verifying token pair...");
            console.log("Token address:", tokenAddress);
            
            TokenBridgeTypes.TokenPair memory pmPair = pmBridgeContract.getTokenPair(tokenAddress);
            TokenBridgeTypes.TokenPair memory smPair = smBridgeContract.getTokenPair(tokenAddress);
            
            require(pmPair.exists, "Token pair should exist on PM side");
            console.log("✓ Token pair exists on PM side");
            console.log("  Acknowledged:", pmPair.acknowledged);
            
            if (smPair.exists) {
                console.log("✓ Token pair exists on SM side");
                console.log("  Acknowledged:", smPair.acknowledged);
                
                if (pmPair.acknowledged && smPair.acknowledged) {
                    console.log("✓ Token pair fully acknowledged on both sides!");
                } else {
                    console.log("⚠ Token pair not yet acknowledged on both sides");
                    console.log("  Wait for LayerZero message delivery");
                }
            } else {
                console.log("⚠ Token pair not yet created on SM side");
                console.log("  Wait for LayerZero message delivery");
            }

            // Test 3: Verify token contract
            console.log("\n[Test 3] Verifying token contract...");
            BridgeableToken token = BridgeableToken(tokenAddress);
            console.log("  Name:", token.name());
            console.log("  Symbol:", token.symbol());
            console.log("  Decimals:", token.decimals());
            console.log("✓ Token contract verified");
        } else {
            console.log("\n[Test 2] Skipped (TEST_TOKEN_ADDRESS not set)");
            console.log("  Set TEST_TOKEN_ADDRESS to verify token pair");
        }

        console.log("\n=== Verification Complete ===");
    }
}

