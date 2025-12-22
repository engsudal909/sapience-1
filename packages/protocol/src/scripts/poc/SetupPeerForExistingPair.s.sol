// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {OAppFactory} from "../../poc/OAppFactory.sol";

/**
 * @title SetupPeerForExistingPair
 * @notice Script to setup LayerZero peer for an existing pair using the factory's owner function
 * @dev The factory has a function setupPeerForPair that can be called by the owner
 *      This is the correct way to setup peers for existing pairs
 */
contract SetupPeerForExistingPair is Script {
    address private constant FACTORY_ADDRESS = 0xe827EbdC7BF7A89aF4d27f1caaCcd21aC3Cf33dD;
    bytes32 private constant TEST_SALT = keccak256("TEST_PAIR_V1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 chainId = block.chainid;
        
        console.log("Setting up peer for existing pair...");
        console.log("Factory:", FACTORY_ADDRESS);
        console.log("Chain ID:", chainId);
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
        console.log("Deployer verified as factory owner (OK)");
        console.log("");
        
        // Verify pair exists
        if (!factory.isPairDeployed(TEST_SALT)) {
            console.log("ERROR: Pair not deployed! Create it first.");
            return;
        }
        
        address pairAddress = factory.getPairAddress(TEST_SALT);
        console.log("Pair address:", pairAddress);
        console.log("");
        
        // Note: The factory is the owner of the pair, so it can call setPeer
        // This is set in the SimpleOAppBase constructor: Ownable(_factory)
        console.log("Note: Factory is the owner of the pair, so it can call setPeer");
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Calling factory.setupPeerForPair()...");
        console.log("(Factory will call setPeer on the pair as owner)");
        console.log("");
        
        factory.setupPeerForPair(TEST_SALT);
        
        vm.stopBroadcast();
        
        console.log("SUCCESS: Peer configured!");
        console.log("");
        console.log("Next: Call setupLayerZero() on the pair to complete the setup");
    }
}

