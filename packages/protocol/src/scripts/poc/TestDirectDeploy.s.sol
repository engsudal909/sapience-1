// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title TestDirectDeploy
 * @notice Test script to deploy OAppFactory directly (not via DDP) to verify constructor works
 * @dev This helps debug why the constructor is reverting when using DDP
 */
contract TestDirectDeploy is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        console.log("Testing direct deployment of OAppFactory...");
        console.log("Deployer address:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");
        
        if (deployer == address(0)) {
            console.log("ERROR: DEPLOYER_ADDRESS is address(0)!");
            revert("Invalid deployer");
        }
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying OAppFactory directly...");
        try new OAppFactory(deployer) returns (OAppFactory factory) {
            console.log("SUCCESS: Factory deployed at:", address(factory));
            console.log("Code size:", address(factory).code.length);
        } catch Error(string memory reason) {
            console.log("ERROR: Deployment failed with reason:", reason);
            revert(reason);
        } catch (bytes memory lowLevelData) {
            console.log("ERROR: Deployment failed with low-level error");
            console.log("Error data (hex):", vm.toString(lowLevelData));
            if (lowLevelData.length >= 4) {
                bytes4 errorSelector = bytes4(lowLevelData);
                console.log("Error selector:", vm.toString(errorSelector));
            }
            revert("Direct deployment failed");
        }
        
        vm.stopBroadcast();
    }
}

