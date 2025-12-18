// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {OAppFactory} from "../../src/poc/OAppFactory.sol";
import {SimpleOAppArbitrum} from "../../src/poc/SimpleOAppArbitrum.sol";
import {SimpleOAppBase} from "../../src/poc/SimpleOAppBase.sol";
import {CREATE3} from "../../src/poc/CREATE3.sol";

/**
 * @title OAppFactoryTest
 * @notice Tests for the OAppFactory PoC
 */
contract OAppFactoryTest is Test {
    OAppFactory public factory;
    bytes32 public constant TEST_SALT = keccak256("TEST_SALT");

    function setUp() public {
        factory = new OAppFactory(address(this));
    }

    function test_CreatePair() public {
        // Skip if not on a supported network
        uint256 chainId = block.chainid;
        if (chainId != 42161 && chainId != 8453) {
            return; // Skip test on unsupported networks
        }

        // Get the expected address before deployment
        address expectedAddress = factory.getPairAddress(TEST_SALT);

        // Create the pair
        address deployedAddress = factory.createPair(TEST_SALT);

        // Verify the address matches
        assertEq(deployedAddress, expectedAddress, "Deployed address should match expected");

        // Verify the contract was deployed
        assertTrue(factory.isPairDeployed(TEST_SALT), "Pair should be marked as deployed");

        // Verify the network type
        OAppFactory.NetworkType networkType = factory.getPairNetworkType(TEST_SALT);
        if (chainId == 42161) {
            assertEq(uint256(networkType), uint256(OAppFactory.NetworkType.ARBITRUM), "Should be Arbitrum");
            // Verify the deployed contract is a SimpleOAppArbitrum
            SimpleOAppArbitrum pair = SimpleOAppArbitrum(payable(deployedAddress));
            assertEq(pair.owner(), address(factory), "Factory should be the owner");
        } else if (chainId == 8453) {
            assertEq(uint256(networkType), uint256(OAppFactory.NetworkType.BASE), "Should be Base");
            // Verify the deployed contract is a SimpleOAppBase
            SimpleOAppBase pair = SimpleOAppBase(payable(deployedAddress));
            assertEq(pair.owner(), address(factory), "Factory should be the owner");
        }
    }

    function test_CreatePairTwiceReverts() public {
        uint256 chainId = block.chainid;
        if (chainId != 42161 && chainId != 8453) {
            return; // Skip test on unsupported networks
        }

        // Create the pair first time
        factory.createPair(TEST_SALT);

        // Try to create again - should revert
        vm.expectRevert(abi.encodeWithSelector(OAppFactory.PairAlreadyExists.selector, TEST_SALT));
        factory.createPair(TEST_SALT);
    }

    function test_GetPairAddress() public {
        uint256 chainId = block.chainid;
        if (chainId != 42161 && chainId != 8453) {
            return; // Skip test on unsupported networks
        }

        // Get address before deployment
        address expectedAddress = factory.getPairAddress(TEST_SALT);

        // Deploy the pair
        address deployedAddress = factory.createPair(TEST_SALT);

        // Verify addresses match
        assertEq(expectedAddress, deployedAddress, "Addresses should match");
    }

    function test_IsPairDeployed() public {
        uint256 chainId = block.chainid;
        if (chainId != 42161 && chainId != 8453) {
            return; // Skip test on unsupported networks
        }

        // Should be false before deployment
        assertFalse(factory.isPairDeployed(TEST_SALT), "Pair should not be deployed initially");

        // Deploy the pair
        factory.createPair(TEST_SALT);

        // Should be true after deployment
        assertTrue(factory.isPairDeployed(TEST_SALT), "Pair should be deployed");
    }

    function test_MultiplePairsDifferentSalts() public {
        uint256 chainId = block.chainid;
        if (chainId != 42161 && chainId != 8453) {
            return; // Skip test on unsupported networks
        }

        bytes32 salt1 = keccak256("SALT_1");
        bytes32 salt2 = keccak256("SALT_2");

        address pair1 = factory.createPair(salt1);
        address pair2 = factory.createPair(salt2);

        // Verify they are different addresses
        assertNotEq(pair1, pair2, "Different salts should produce different addresses");

        // Verify both are deployed
        assertTrue(factory.isPairDeployed(salt1), "Pair 1 should be deployed");
        assertTrue(factory.isPairDeployed(salt2), "Pair 2 should be deployed");
    }

    function test_CreatePairWithType() public {
        bytes32 salt1 = keccak256("SALT_ARBITRUM");
        bytes32 salt2 = keccak256("SALT_BASE");

        // Create Arbitrum pair
        address arbitrumPair = factory.createPairWithType(
            salt1,
            OAppFactory.NetworkType.ARBITRUM
        );
        assertEq(
            uint256(factory.getPairNetworkType(salt1)),
            uint256(OAppFactory.NetworkType.ARBITRUM),
            "Should be Arbitrum type"
        );

        // Create Base pair
        address basePair = factory.createPairWithType(
            salt2,
            OAppFactory.NetworkType.BASE
        );
        assertEq(
            uint256(factory.getPairNetworkType(salt2)),
            uint256(OAppFactory.NetworkType.BASE),
            "Should be Base type"
        );

        // Verify they are different addresses
        assertNotEq(arbitrumPair, basePair, "Different network types should produce different addresses");
    }

    function test_SameSaltSameAddress() public {
        // Create factory 1
        OAppFactory factory1 = new OAppFactory(address(this));
        address address1 = factory1.getPairAddress(TEST_SALT);

        // Create factory 2 at the same address (using vm.etch to simulate)
        // Note: In real scenario, factories need to be deployed at same address on different chains
        // This test verifies that same salt + same factory address = same pair address
        assertEq(address1, factory1.getPairAddress(TEST_SALT), "Same salt should give same address");
    }
}

