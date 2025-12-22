// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title CreatePair
 * @notice Simple script to create a pair - just creates the pair, nothing else
 * @dev Use this if ConfigureAndTest fails at pair creation
 */
contract CreatePair is Script {
    address private constant FACTORY_ADDRESS = 0xe827EbdC7BF7A89aF4d27f1caaCcd21aC3Cf33dD;
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 chainId = block.chainid;
        
        console.log("Creating Pair...");
        console.log("Factory:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
        console.log("Salt:", vm.toString(TEST_SALT));
        console.log("");
        
        OAppFactory factory = OAppFactory(FACTORY_ADDRESS);
        
        // Check if pair exists
        bool exists = factory.isPairDeployed(TEST_SALT);
        address expectedAddress = factory.getPairAddress(TEST_SALT);
        
        console.log("Pair exists:", exists);
        console.log("Expected address:", expectedAddress);
        console.log("");
        
        if (exists) {
            console.log("Pair already exists! Skipping creation.");
            return;
        }
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Creating pair...");
        address deployed = factory.createPair(TEST_SALT);
        
        vm.stopBroadcast();
        
        console.log("Pair created at:", deployed);
        console.log("Matches expected:", deployed == expectedAddress);
        console.log("");
        console.log("Next steps:");
        console.log("1. Create the pair on the other network with the same salt");
        console.log("2. Configure DVN on both networks using ConfigureDVNForPair.s.sol");
        console.log("   (Note: This may fail if libraries are not registered - check LayerZero docs)");
        console.log("3. Setup peer on both networks using SetupPeerForExistingPair.s.sol");
        console.log("4. Call setupLayerZero() on both pairs to complete the setup");
    }
}

