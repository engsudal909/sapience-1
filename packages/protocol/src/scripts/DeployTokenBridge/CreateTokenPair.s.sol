// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {TokenBridge} from "../../bridge/TokenBridge.sol";
import {BridgeableToken} from "../../bridge/BridgeableToken.sol";

/**
 * @title CreateTokenPair
 * @notice Create a test token pair on PM side
 */
contract CreateTokenPair is Script {
    function run() external {
        address pmBridge = vm.envAddress("PM_BRIDGE");
        
        TokenBridge pmBridgeContract = TokenBridge(payable(pmBridge));

        console.log("=== Creating Token Pair ===");
        console.log("PM Bridge:", pmBridge);

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

        console.log("Token pair created!");
        console.log("Expected token address:", expectedToken);
        console.log("Token name:", tokenName);
        console.log("Token symbol:", tokenSymbol);
        console.log("Token decimals:", tokenDecimals);
        console.log("\n⚠ Note: Wait for LayerZero message delivery for ACK");
    }
}

