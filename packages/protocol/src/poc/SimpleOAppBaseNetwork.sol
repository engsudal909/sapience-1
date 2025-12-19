// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SimpleOAppBase.sol";

/**
 * @title SimpleOAppBaseNetwork
 * @notice Simple OApp implementation for Base network
 * @dev Extends SimpleOAppBase with Base-specific endpoint and EIDs
 */
contract SimpleOAppBaseNetwork is SimpleOAppBase {
    // Base LayerZero endpoint (mainnet) - LayerZero v2 unified endpoint
    address private constant BASE_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;

    // LayerZero EIDs - Mainnet only
    // Arbitrum = 30110, Base = 30140
    uint32 private constant ARBITRUM_EID = 30110;
    uint32 private constant BASE_EID = 30140;

    /**
     * @notice Constructor that accepts factory address and endpoint
     * @param _factory The address of the factory that deploys this contract
     * @param _endpoint The LayerZero endpoint address for this network
     * @dev The factory determines the endpoint in time of execution and passes it here
     */
    constructor(address _factory, address _endpoint) SimpleOAppBase(_factory, _endpoint) {
        // Mainnet only - EIDs are constants
    }

    /**
     * @notice Get the LayerZero endpoint address for Base
     * @return The Base endpoint address (mainnet)
     */
    function getEndpoint() public pure override returns (address) {
        return BASE_ENDPOINT;
    }

    /**
     * @notice Get the local EID (Base's EID)
     * @return The Base EID (30140)
     */
    function getLocalEid() public pure override returns (uint32) {
        return BASE_EID;
    }

    /**
     * @notice Get the remote EID (Arbitrum's EID)
     * @return The Arbitrum EID (30110)
     */
    function getRemoteEid() public pure override returns (uint32) {
        return ARBITRUM_EID;
    }
}

