// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {CREATE3} from "./CREATE3.sol";
import {SimpleOAppArbitrum} from "./SimpleOAppArbitrum.sol";
import {SimpleOAppBase} from "./SimpleOAppBase.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OAppFactory
 * @notice Factory contract that uses CREATE3 to deploy SimpleOApp contracts
 * @dev This factory ensures that contracts deployed on different networks have the same address
 *      It automatically selects the correct OApp implementation based on the chain ID
 */
contract OAppFactory is Ownable {
    using CREATE3 for bytes32;

    /**
     * @notice Network type enum
     */
    enum NetworkType {
        ARBITRUM,
        BASE
    }

    /**
     * @notice Emitted when a new pair is created
     * @param pairAddress The address of the deployed SimpleOApp contract
     * @param salt The salt used for CREATE3 deployment
     * @param networkType The network type of the deployed contract
     */
    event PairCreated(
        address indexed pairAddress,
        bytes32 indexed salt,
        NetworkType networkType
    );

    /**
     * @notice Mapping to track deployed pairs by salt
     * @return pairAddress The address of the deployed contract, or address(0) if not deployed
     */
    mapping(bytes32 => address) public deployedPairs;

    /**
     * @notice Mapping to track network type by salt
     */
    mapping(bytes32 => NetworkType) public pairNetworkType;

    /**
     * @notice Default DVN configuration per network type
     */
    mapping(NetworkType => DVNConfig) public defaultDVNConfig;

    /**
     * @notice Flag to track if default DVN config is set for each network
     */
    mapping(NetworkType => bool) public isDVNConfigSet;

    /**
     * @notice Constructor
     * @param _owner The owner of the factory
     */
    constructor(address _owner) Ownable(_owner) {}

    // Chain IDs
    uint256 private constant CHAIN_ID_ARBITRUM = 42161;
    uint256 private constant CHAIN_ID_BASE = 8453;

    // LayerZero EIDs
    uint32 private constant ARBITRUM_EID = 30110;
    uint32 private constant BASE_EID = 30140;

    // Config type constants
    uint32 private constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 private constant ULN_CONFIG_TYPE = 2;

    // DVN Configuration struct
    struct DVNConfig {
        address sendLib;
        address receiveLib;
        address requiredDVN;
        address executor;
        uint64 confirmations;
        uint32 maxMessageSize;
        uint32 gracePeriod;
    }

    /**
     * @notice Creates a new SimpleOApp pair using CREATE3, automatically detecting the network
     * @param salt The salt to use for deterministic address generation
     * @return pairAddress The address of the deployed SimpleOApp contract
     * @dev The same salt on different networks will result in the same address
     *      (assuming the factory is deployed at the same address on both networks)
     *      Automatically selects Arbitrum or Base implementation based on block.chainid
     */
    function createPair(bytes32 salt) external returns (address pairAddress) {
        NetworkType networkType = _getNetworkType();
        return _createPair(salt, networkType);
    }

    /**
     * @notice Creates a new SimpleOApp pair using CREATE3 with explicit network type
     * @param salt The salt to use for deterministic address generation
     * @param networkType The network type to deploy (ARBITRUM or BASE)
     * @return pairAddress The address of the deployed SimpleOApp contract
     * @dev Allows explicit selection of network type, useful for testing or cross-deployment
     */
    function createPairWithType(
        bytes32 salt,
        NetworkType networkType
    ) external returns (address pairAddress) {
        return _createPair(salt, networkType);
    }

    /**
     * @notice Internal function to create a pair
     * @param salt The salt to use for deterministic address generation
     * @param networkType The network type to deploy
     * @return pairAddress The address of the deployed SimpleOApp contract
     */
    function _createPair(
        bytes32 salt,
        NetworkType networkType
    ) internal returns (address pairAddress) {
        // Check if pair already exists
        if (deployedPairs[salt] != address(0)) {
            revert PairAlreadyExists(salt);
        }

        // Get the bytecode based on network type
        bytes memory bytecode;
        if (networkType == NetworkType.ARBITRUM) {
            bytecode = abi.encodePacked(
                type(SimpleOAppArbitrum).creationCode,
                abi.encode(address(this))
            );
        } else if (networkType == NetworkType.BASE) {
            bytecode = abi.encodePacked(
                type(SimpleOAppBase).creationCode,
                abi.encode(address(this))
            );
        } else {
            revert InvalidNetworkType();
        }

        // Deploy using CREATE3
        pairAddress = CREATE3.deploy(salt, bytecode);

        // Verify deployment was successful
        if (pairAddress == address(0)) {
            revert DeploymentFailed();
        }

        // Store the deployed address and network type
        deployedPairs[salt] = pairAddress;
        pairNetworkType[salt] = networkType;

        // Automatically configure DVN if default config is set
        if (isDVNConfigSet[networkType]) {
            _configureDVN(salt, defaultDVNConfig[networkType]);
        }

        emit PairCreated(pairAddress, salt, networkType);
    }

    /**
     * @notice Gets the network type based on the current chain ID
     * @return The network type (ARBITRUM or BASE)
     * @dev Reverts if chain ID is not supported
     */
    function _getNetworkType() internal view returns (NetworkType) {
        uint256 chainId = block.chainid;
        if (chainId == CHAIN_ID_ARBITRUM) {
            return NetworkType.ARBITRUM;
        } else if (chainId == CHAIN_ID_BASE) {
            return NetworkType.BASE;
        } else {
            revert UnsupportedChainId(chainId);
        }
    }

    /**
     * @notice Gets the address where a pair would be deployed for a given salt (auto-detects network)
     * @param salt The salt to check
     * @return The address where the contract would be deployed
     */
    function getPairAddress(bytes32 salt) external view returns (address) {
        NetworkType networkType = _getNetworkType();
        return _getPairAddress(salt, networkType);
    }

    /**
     * @notice Gets the address where a pair would be deployed for a given salt and network type
     * @param salt The salt to check
     * @param networkType The network type to use for address calculation
     * @return The address where the contract would be deployed
     */
    function getPairAddress(
        bytes32 salt,
        NetworkType networkType
    ) external view returns (address) {
        return _getPairAddress(salt, networkType);
    }

    /**
     * @notice Internal function to get the address where a pair would be deployed
     * @param salt The salt to check
     * @return The address where the contract would be deployed
     * @dev The networkType parameter is unused but kept for API consistency
     *      CREATE3.getDeployed doesn't actually use the bytecode for address calculation
     *      The address is deterministic based on the factory address and salt only
     */
    function _getPairAddress(
        bytes32 salt,
        NetworkType /* networkType */
    ) internal view returns (address) {
        // Note: CREATE3.getDeployed doesn't actually use the bytecode for address calculation
        // The address is deterministic based on the factory address and salt only
        // The networkType parameter is kept for API consistency but not used in calculation
        return CREATE3.getDeployed(salt);
    }

    /**
     * @notice Checks if a pair has been deployed for a given salt
     * @param salt The salt to check
     * @return True if the pair has been deployed, false otherwise
     */
    function isPairDeployed(bytes32 salt) external view returns (bool) {
        return deployedPairs[salt] != address(0);
    }

    /**
     * @notice Gets the network type for a deployed pair
     * @param salt The salt to check
     * @return The network type of the deployed pair
     */
    function getPairNetworkType(bytes32 salt) external view returns (NetworkType) {
        return pairNetworkType[salt];
    }

    /**
     * @notice Set default DVN configuration for a network type
     * @param networkType The network type to configure
     * @param sendLib The send library address
     * @param receiveLib The receive library address
     * @param requiredDVN The required DVN address
     * @param executor The executor address
     * @param confirmations Minimum block confirmations
     * @param maxMessageSize Maximum message size in bytes
     * @param gracePeriod Grace period for library switch
     * @dev This configuration will be automatically applied to all pairs created for this network type
     */
    function setDefaultDVNConfig(
        NetworkType networkType,
        address sendLib,
        address receiveLib,
        address requiredDVN,
        address executor,
        uint64 confirmations,
        uint32 maxMessageSize,
        uint32 gracePeriod
    ) external onlyOwner {
        defaultDVNConfig[networkType] = DVNConfig({
            sendLib: sendLib,
            receiveLib: receiveLib,
            requiredDVN: requiredDVN,
            executor: executor,
            confirmations: confirmations,
            maxMessageSize: maxMessageSize,
            gracePeriod: gracePeriod
        });
        isDVNConfigSet[networkType] = true;
    }

    /**
     * @notice Set default DVN configuration with default values
     * @param networkType The network type to configure
     * @param sendLib The send library address
     * @param receiveLib The receive library address
     * @param requiredDVN The required DVN address
     * @param executor The executor address
     * @dev Uses default values: 20 confirmations, 10000 max message size, 0 grace period
     */
    function setDefaultDVNConfigWithDefaults(
        NetworkType networkType,
        address sendLib,
        address receiveLib,
        address requiredDVN,
        address executor
    ) external onlyOwner {
        defaultDVNConfig[networkType] = DVNConfig({
            sendLib: sendLib,
            receiveLib: receiveLib,
            requiredDVN: requiredDVN,
            executor: executor,
            confirmations: 20,
            maxMessageSize: 10000,
            gracePeriod: 0
        });
        isDVNConfigSet[networkType] = true;
    }

    /**
     * @notice Internal function to configure LayerZero DVN
     * @param salt The salt of the deployed pair
     * @param config The DVN configuration parameters
     * @dev Configures the LayerZero endpoint for the deployed OApp contract
     */
    function _configureDVN(bytes32 salt, DVNConfig memory config) internal {
        address oapp = deployedPairs[salt];
        if (oapp == address(0)) {
            revert PairNotDeployed(salt);
        }

        NetworkType networkType = pairNetworkType[salt];
        address endpoint = networkType == NetworkType.ARBITRUM
            ? 0x6EDCE65403992e310A62460808c4b910D972f10f
            : 0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7;
        
        uint32 remoteEid = networkType == NetworkType.ARBITRUM ? BASE_EID : ARBITRUM_EID;
        uint32 localEid = networkType == NetworkType.ARBITRUM ? ARBITRUM_EID : BASE_EID;

        ILayerZeroEndpointV2 endpointContract = ILayerZeroEndpointV2(endpoint);
        endpointContract.setSendLibrary(oapp, remoteEid, config.sendLib);
        endpointContract.setReceiveLibrary(oapp, localEid, config.receiveLib, config.gracePeriod);

        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = config.requiredDVN;

        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(remoteEid, EXECUTOR_CONFIG_TYPE, abi.encode(ExecutorConfig(config.maxMessageSize, config.executor)));
        params[1] = SetConfigParam(remoteEid, ULN_CONFIG_TYPE, abi.encode(UlnConfig(
            config.confirmations, 1, type(uint8).max, 0, requiredDVNs, new address[](0)
        )));

        endpointContract.setConfig(oapp, config.sendLib, params);
    }

    // ============ Errors ============
    error PairAlreadyExists(bytes32 salt);
    error DeploymentFailed();
    error InvalidNetworkType();
    error UnsupportedChainId(uint256 chainId);
    error PairNotDeployed(bytes32 salt);
}

