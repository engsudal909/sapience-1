// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SimpleOAppBase.sol";

/**
 * @title SimpleOAppArbitrum
 * @notice Simple OApp implementation for Arbitrum network
 * @dev Extends SimpleOAppBase with Arbitrum-specific endpoint and EIDs
 */
contract SimpleOAppArbitrum is SimpleOAppBase {
    // Arbitrum LayerZero endpoint (mainnet)
    address private constant ARBITRUM_ENDPOINT = 0x6EDCE65403992e310A62460808c4b910D972f10f;

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
     * @notice Get the LayerZero endpoint address for Arbitrum
     * @return The Arbitrum endpoint address
     */
    function getEndpoint() public pure override returns (address) {
        return ARBITRUM_ENDPOINT;
    }

    /**
     * @notice Get the local EID (Arbitrum's EID)
     * @return The Arbitrum EID (30110)
     */
    function getLocalEid() public pure override returns (uint32) {
        return ARBITRUM_EID;
    }

    /**
     * @notice Get the remote EID (Base's EID)
     * @return The Base EID (30140)
     */
    function getRemoteEid() public pure override returns (uint32) {
        return BASE_EID;
    }
}
