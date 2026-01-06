// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";
import {BridgeableToken} from "../../bridge/BridgeableToken.sol";
import {TokenBridgeTypes} from "../../bridge/TokenBridgeTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TestTokenBridge
 * @notice Test script to verify TokenBridge deployment and functionality
 */
contract TestTokenBridge is Script {
    function run() external {
        address pmBridge = vm.envAddress("PM_BRIDGE");
        address smBridge = vm.envAddress("SM_BRIDGE");
        
        TokenBridge pmBridgeContract = TokenBridge(payable(pmBridge));
        TokenBridge smBridgeContract = TokenBridge(payable(smBridge));

        console.log("=== TokenBridge Test ===");
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

        // Test 2: Create a token pair (only on PM side)
        console.log("\n[Test 2] Creating token pair...");
        string memory tokenName = vm.envOr("TEST_TOKEN_NAME", string("TestToken"));
        string memory tokenSymbol = vm.envOr("TEST_TOKEN_SYMBOL", string("TTK"));
        uint8 tokenDecimals = uint8(vm.envOr("TEST_TOKEN_DECIMALS", uint256(18)));
        bytes32 salt = vm.envOr("TEST_TOKEN_SALT", bytes32(uint256(12345)));

        vm.startBroadcast(vm.envUint("PM_PRIVATE_KEY"));
        pmBridgeContract.createTokenPair(tokenName, tokenSymbol, tokenDecimals, salt);
        vm.stopBroadcast();

        // Compute expected token address
        bytes memory bytecode = abi.encodePacked(
            type(BridgeableToken).creationCode,
            abi.encode(tokenName, tokenSymbol, tokenDecimals, pmBridge)
        );
        bytes32 bytecodeHash = keccak256(bytecode);
        address expectedToken = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            pmBridge,
                            salt,
                            bytecodeHash
                        )
                    )
                )
            )
        );

        console.log("Expected token address:", expectedToken);
        
        // Check token pair on PM side
        TokenBridgeTypes.TokenPair memory pmPair = pmBridgeContract.getTokenPair(expectedToken);
        require(pmPair.exists, "Token pair should exist on PM side");
        console.log("✓ Token pair created on PM side");

        // Note: In a real test, you would need to wait for LayerZero message delivery
        // and then check SM side. For now, we'll just verify PM side.
        console.log("\n⚠ Note: Token pair ACK requires LayerZero message delivery.");
        console.log("  Run this script again after LayerZero messages are delivered");
        console.log("  to verify the token pair is acknowledged on both sides.");

        // Test 3: Verify token exists
        console.log("\n[Test 3] Verifying token contract...");
        BridgeableToken token = BridgeableToken(expectedToken);
        require(
            keccak256(bytes(token.name())) == keccak256(bytes(tokenName)),
            "Token name mismatch"
        );
        require(
            keccak256(bytes(token.symbol())) == keccak256(bytes(tokenSymbol)),
            "Token symbol mismatch"
        );
        require(token.decimals() == tokenDecimals, "Token decimals mismatch");
        console.log("✓ Token contract verified");
        console.log("  Name:", token.name());
        console.log("  Symbol:", token.symbol());
        console.log("  Decimals:", token.decimals());

        console.log("\n=== Test Complete ===");
        console.log("\nNext steps:");
        console.log("1. Wait for LayerZero message delivery");
        console.log("2. Verify token pair is acknowledged on both sides");
        console.log("3. Test bridging tokens between chains");
    }
}

