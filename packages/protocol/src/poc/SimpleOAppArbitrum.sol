// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SimpleOAppBase.sol";

/**
 * @title SimpleOAppArbitrum
 * @notice Simple OApp implementation for Arbitrum network
 * @dev Extends SimpleOAppBase with Arbitrum-specific endpoint and EIDs
 */
contract SimpleOAppArbitrum is SimpleOAppBase {
    // Arbitrum LayerZero endpoint (same for mainnet and testnet)
    address private constant ARBITRUM_ENDPOINT = 0x6EDCE65403992e310A62460808c4b910D972f10f;

    // LayerZero EIDs
    // Mainnet: Arbitrum = 30110, Base = 30140
    // Testnet: Arbitrum Sepolia = 40231, Base Sepolia = 40245
    uint32 private immutable ARBITRUM_EID;
    uint32 private immutable BASE_EID;

    /**
     * @notice Constructor that accepts factory address and endpoint
     * @param _factory The address of the factory that deploys this contract
     * @param _endpoint The LayerZero endpoint address for this network
     * @dev The factory determines the endpoint in time of execution and passes it here
     */
    constructor(address _factory, address _endpoint) SimpleOAppBase(_factory, _endpoint) {
        // Detect network: Arbitrum Sepolia = 421614, Arbitrum One = 42161
        uint256 chainId = block.chainid;
        if (chainId == 421614) {
            // Arbitrum Sepolia testnet
            ARBITRUM_EID = 40231;
            BASE_EID = 40245;
        } else {
            // Arbitrum One mainnet (or other networks)
            ARBITRUM_EID = 30110;
            BASE_EID = 30140;
        }
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
     * @return The Arbitrum EID
     */
    function getLocalEid() public view override returns (uint32) {
        return ARBITRUM_EID;
    }

    /**
     * @notice Get the remote EID (Base's EID)
     * @return The Base EID
     */
    function getRemoteEid() public view override returns (uint32) {
        return BASE_EID;
    }
}
