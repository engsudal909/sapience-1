// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title ConfigureDVNForPair
 * @notice Script to configure DVN for an existing pair
 * @dev This script calls configureDVNForPair() on the factory to configure DVN
 *      for a pair that was created without automatic DVN configuration.
 * 
 * Prerequisites:
 * 1. Pair must be created
 * 2. Default DVN config must be set for the network type
 * 3. Libraries must be registered in the LayerZero endpoint
 */
contract ConfigureDVNForPair is Script {
    address private constant FACTORY_ADDRESS = 0xD3ccEF4741d1C7886321bf732E010455F9c60a1B;
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        console.log("========================================");
        console.log("Configure DVN for Pair");
        console.log("========================================");
        console.log("Factory address:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("Network:", chainId == 42161 ? "Arbitrum One" : "Base");
        console.log("Salt:", vm.toString(TEST_SALT));
        console.log("");
        
        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        
        // Verify deployer is the factory owner
        address factoryOwner = factory.owner();
        if (deployer != factoryOwner) {
            console.log("ERROR: Deployer is not the factory owner!");
            console.log("Deployer address:", deployer);
            console.log("Factory owner:", factoryOwner);
            revert("Not factory owner");
        }
        console.log("Deployer verified as factory owner ✓");
        console.log("");
        
        // Verify pair exists
        if (!factory.isPairDeployed(TEST_SALT)) {
            console.log("ERROR: Pair not deployed! Create it first.");
            return;
        }
        
        address pairAddress = factory.getPairAddress(TEST_SALT);
        console.log("Pair address:", pairAddress);
        console.log("");
        
        // Check if DVN config is set
        OAppFactory.NetworkType networkType = chainId == 42161 
            ? OAppFactory.NetworkType.ARBITRUM 
            : OAppFactory.NetworkType.BASE;
        
        bool isDVNConfigSet = factory.isDVNConfigSet(networkType);
        if (!isDVNConfigSet) {
            console.log("ERROR: DVN config not set for this network type!");
            console.log("Run ConfigureDVN.s.sol first to set default DVN config.");
            return;
        }
        console.log("DVN config verified ✓");
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Configuring DVN for pair...");
        console.log("(This may fail if libraries are not registered in the endpoint)");
        console.log("");
        
        factory.configureDVNForPair(TEST_SALT);
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("SUCCESS: DVN configured for pair!");
        console.log("");
    }
}

