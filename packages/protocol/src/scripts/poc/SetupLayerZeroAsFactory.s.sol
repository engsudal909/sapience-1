// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBaseNetwork} from "../../poc/SimpleOAppBaseNetwork.sol";

/**
 * @title SetupLayerZeroAsFactory
 * @notice Script to setup LayerZero on an existing pair, called by the factory (owner)
 * @dev The factory is the owner of the pairs, so it can call setPeer directly
 *      This script uses the factory to setup the peer, then calls setupLayerZero to complete the setup
 */
contract SetupLayerZeroAsFactory is Script {
    address private constant FACTORY_ADDRESS = 0x1847e316e6e4302b23B5Ab5BE078926386D78E95;
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        console.log("Setting up LayerZero as Factory (owner)...");
        console.log("Factory:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("");
        
        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        address pairAddress = factory.getPairAddress(TEST_SALT);
        
        console.log("Pair address:", pairAddress);
        
        // Verify pair exists
        if (!factory.isPairDeployed(TEST_SALT)) {
            console.log("ERROR: Pair not deployed! Create it first.");
            return;
        }
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Determine EIDs
        bool isTestnet = chainId == 421614 || chainId == 84532;
        uint32 remoteEid;
        
        if (chainId == 421614) {
            // Arbitrum Sepolia
            remoteEid = isTestnet ? 40245 : 30140; // Base EID
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(pairAddress));
            
            bool isSetup = pair.isSetupComplete();
            console.log("Current setup status:", isSetup);
            
            if (!isSetup) {
                // Factory is owner, so it can call setPeer
                bytes32 peerAddress = bytes32(uint256(uint160(pairAddress)));
                pair.setPeer(remoteEid, peerAddress);
                console.log("Peer set by factory");
                
                // Now call setupLayerZero to complete the setup
                pair.setupLayerZero();
                console.log("SUCCESS: LayerZero setup complete!");
            } else {
                console.log("LayerZero already configured");
            }
            
            console.log("Final setup status:", pair.isSetupComplete());
            console.log("Received value:", pair.getValue());
            
        } else if (chainId == 84532) {
            // Base Sepolia
            remoteEid = isTestnet ? 40231 : 30110; // Arbitrum EID
            SimpleOAppBaseNetwork pair = SimpleOAppBaseNetwork(payable(pairAddress));
            
            bool isSetup = pair.isSetupComplete();
            console.log("Current setup status:", isSetup);
            
            if (!isSetup) {
                // Factory is owner, so it can call setPeer
                bytes32 peerAddress = bytes32(uint256(uint160(pairAddress)));
                pair.setPeer(remoteEid, peerAddress);
                console.log("Peer set by factory");
                
                // Now call setupLayerZero to complete the setup
                pair.setupLayerZero();
                console.log("SUCCESS: LayerZero setup complete!");
            } else {
                console.log("LayerZero already configured");
            }
            
            console.log("Final setup status:", pair.isSetupComplete());
            console.log("Received value:", pair.getValue());
            
        } else {
            console.log("ERROR: Unsupported network!");
        }
        
        vm.stopBroadcast();
    }
}

