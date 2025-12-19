// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SimpleOAppBase.sol";

/**
 * @title SimpleOAppBaseNetwork
 * @notice Simple OApp implementation for Base network
 * @dev Extends SimpleOAppBase with Base-specific endpoint and EIDs
 */
contract SimpleOAppBaseNetwork is SimpleOAppBase {
    // Base LayerZero endpoint (same for mainnet and testnet)
    address private constant BASE_ENDPOINT = 0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7;

    // LayerZero EIDs
    // Mainnet: Arbitrum = 30110, Base = 30140
    // Testnet: Arbitrum Sepolia = 40231, Base Sepolia = 40245
    uint32 private immutable ARBITRUM_EID;
    uint32 private immutable BASE_EID;

    /**
     * @notice Constructor that accepts factory address
     * @param _factory The address of the factory that deploys this contract
     * @dev Automatically detects if running on testnet or mainnet based on chain ID
     */
    constructor(address _factory) SimpleOAppBase(_factory, BASE_ENDPOINT) {
        // Detect network: Base Sepolia = 84532, Base = 8453
        uint256 chainId = block.chainid;
        if (chainId == 84532) {
            // Base Sepolia testnet
            ARBITRUM_EID = 40231;
            BASE_EID = 40245;
        } else {
            // Base mainnet (or other networks)
            ARBITRUM_EID = 30110;
            BASE_EID = 30140;
        }
    }

    /**
     * @notice Get the LayerZero endpoint address for Base
     * @return The Base endpoint address
     */
    function getEndpoint() public pure override returns (address) {
        return BASE_ENDPOINT;
    }

    /**
     * @notice Get the local EID (Base's EID)
     * @return The Base EID
     */
    function getLocalEid() public view override returns (uint32) {
        return BASE_EID;
    }

    /**
     * @notice Get the remote EID (Arbitrum's EID)
     * @return The Arbitrum EID
     */
    function getRemoteEid() public view override returns (uint32) {
        return ARBITRUM_EID;
    }
}

