// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

/**
 * @title SendDummyTx
 * @notice Script to send dummy transactions to adjust nonce
 * @dev Use this to match nonces between networks before deploying the factory
 */
contract SendDummyTx is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        uint256 currentNonce = vm.getNonce(deployer);
        uint256 chainId = block.chainid;
        
        console.log("========================================");
        console.log("Send Dummy Transaction");
        console.log("========================================");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", chainId);
        console.log("Current nonce:", currentNonce);
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Send ETH to self (0 value transaction)
        // This increments the nonce by 1
        payable(deployer).transfer(0);
        
        vm.stopBroadcast();
        
        uint256 newNonce = vm.getNonce(deployer);
        console.log("New nonce:", newNonce);
        console.log("Nonce increased by:", newNonce - currentNonce);
        console.log("");
    }
}

