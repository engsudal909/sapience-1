// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {CREATE3} from "./CREATE3.sol";
import {SimpleOAppArbitrum} from "./SimpleOAppArbitrum.sol";
import {SimpleOAppBaseNetwork} from "./SimpleOAppBaseNetwork.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
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
     * @notice Emitted when default DVN configuration is set
     * @param networkType The network type for which the config was set
     * @param config The DVN configuration
     */
    event DefaultDVNConfigSet(NetworkType indexed networkType, DVNConfig config);

    /**
     * @notice Emitted when DVN is configured for a pair
     * @param salt The salt of the pair
     * @param oapp The OApp contract address
     * @param config The DVN configuration applied
     */
    event DVNConfigured(bytes32 indexed salt, address indexed oapp, DVNConfig config);

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
    uint256 private constant CHAIN_ID_ARBITRUM_SEPOLIA = 421614;
    uint256 private constant CHAIN_ID_BASE = 8453;
    uint256 private constant CHAIN_ID_BASE_SEPOLIA = 84532;

    // LayerZero EIDs - Mainnet
    uint32 private constant ARBITRUM_EID_MAINNET = 30110;
    uint32 private constant BASE_EID_MAINNET = 30140;
    
    // LayerZero EIDs - Testnet
    uint32 private constant ARBITRUM_EID_TESTNET = 40231;
    uint32 private constant BASE_EID_TESTNET = 40245;

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
                type(SimpleOAppBaseNetwork).creationCode,
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

        emit PairCreated(pairAddress, salt, networkType);

        // Automatically configure DVN if default config is set
        // Note: This is done after emitting the event to ensure the pair is registered first
        if (isDVNConfigSet[networkType]) {
            _configureDVN(salt, defaultDVNConfig[networkType]);
        }

        // Automatically setup LayerZero peer (factory is owner, so it can call setPeer)
        // Note: This is done after emitting the event to ensure the pair is registered first
        _setupLayerZeroPeer(salt, networkType);
    }

    /**
     * @notice Gets the network type based on the current chain ID
     * @return The network type (ARBITRUM or BASE)
     * @dev Reverts if chain ID is not supported
     */
    function _getNetworkType() internal view returns (NetworkType) {
        uint256 chainId = block.chainid;
        if (chainId == CHAIN_ID_ARBITRUM || chainId == CHAIN_ID_ARBITRUM_SEPOLIA) {
            return NetworkType.ARBITRUM;
        } else if (chainId == CHAIN_ID_BASE || chainId == CHAIN_ID_BASE_SEPOLIA) {
            return NetworkType.BASE;
        } else {
            revert UnsupportedChainId(chainId);
        }
    }
    
    /**
     * @notice Check if current network is a testnet
     * @return True if running on testnet
     */
    function isTestnet() external view returns (bool) {
        uint256 chainId = block.chainid;
        return chainId == CHAIN_ID_ARBITRUM_SEPOLIA || chainId == CHAIN_ID_BASE_SEPOLIA;
    }
    
    /**
     * @notice Get the LayerZero EID for Arbitrum (mainnet or testnet)
     * @return The EID for Arbitrum network
     */
    function getArbitrumEid() external view returns (uint32) {
        uint256 chainId = block.chainid;
        if (chainId == CHAIN_ID_ARBITRUM_SEPOLIA) {
            return ARBITRUM_EID_TESTNET;
        }
        return ARBITRUM_EID_MAINNET;
    }
    
    /**
     * @notice Get the LayerZero EID for Base (mainnet or testnet)
     * @return The EID for Base network
     */
    function getBaseEid() external view returns (uint32) {
        uint256 chainId = block.chainid;
        if (chainId == CHAIN_ID_BASE_SEPOLIA) {
            return BASE_EID_TESTNET;
        }
        return BASE_EID_MAINNET;
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
        // Validate addresses
        if (sendLib == address(0)) {
            revert InvalidAddress("sendLib");
        }
        if (receiveLib == address(0)) {
            revert InvalidAddress("receiveLib");
        }
        if (requiredDVN == address(0)) {
            revert InvalidAddress("requiredDVN");
        }
        if (executor == address(0)) {
            revert InvalidAddress("executor");
        }

        // Validate confirmations (reasonable bounds: 1-100)
        if (confirmations == 0 || confirmations > 100) {
            revert InvalidConfirmations(confirmations);
        }

        // Validate maxMessageSize (reasonable bounds: 1-100000 bytes)
        if (maxMessageSize == 0 || maxMessageSize > 100000) {
            revert InvalidMaxMessageSize(maxMessageSize);
        }

        DVNConfig memory config = DVNConfig({
            sendLib: sendLib,
            receiveLib: receiveLib,
            requiredDVN: requiredDVN,
            executor: executor,
            confirmations: confirmations,
            maxMessageSize: maxMessageSize,
            gracePeriod: gracePeriod
        });

        defaultDVNConfig[networkType] = config;
        isDVNConfigSet[networkType] = true;

        emit DefaultDVNConfigSet(networkType, config);
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
        // Validate addresses
        if (sendLib == address(0)) {
            revert InvalidAddress("sendLib");
        }
        if (receiveLib == address(0)) {
            revert InvalidAddress("receiveLib");
        }
        if (requiredDVN == address(0)) {
            revert InvalidAddress("requiredDVN");
        }
        if (executor == address(0)) {
            revert InvalidAddress("executor");
        }

        DVNConfig memory config = DVNConfig({
            sendLib: sendLib,
            receiveLib: receiveLib,
            requiredDVN: requiredDVN,
            executor: executor,
            confirmations: 20,
            maxMessageSize: 10000,
            gracePeriod: 0
        });

        defaultDVNConfig[networkType] = config;
        isDVNConfigSet[networkType] = true;

        emit DefaultDVNConfigSet(networkType, config);
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
        
        // Determine EIDs based on current network (testnet or mainnet)
        uint256 chainId = block.chainid;
        bool isTestnetNetwork = chainId == CHAIN_ID_ARBITRUM_SEPOLIA || chainId == CHAIN_ID_BASE_SEPOLIA;
        
        uint32 remoteEid;
        uint32 localEid;
        if (networkType == NetworkType.ARBITRUM) {
            remoteEid = isTestnetNetwork ? BASE_EID_TESTNET : BASE_EID_MAINNET;
            localEid = isTestnetNetwork ? ARBITRUM_EID_TESTNET : ARBITRUM_EID_MAINNET;
        } else {
            remoteEid = isTestnetNetwork ? ARBITRUM_EID_TESTNET : ARBITRUM_EID_MAINNET;
            localEid = isTestnetNetwork ? BASE_EID_TESTNET : BASE_EID_MAINNET;
        }

        ILayerZeroEndpointV2 endpointContract = ILayerZeroEndpointV2(endpoint);
        endpointContract.setSendLibrary(oapp, remoteEid, config.sendLib);
        endpointContract.setReceiveLibrary(oapp, localEid, config.receiveLib, config.gracePeriod);

        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = config.requiredDVN;

        ExecutorConfig memory executorConfig = ExecutorConfig(config.maxMessageSize, config.executor);
        UlnConfig memory ulnConfig = UlnConfig(
            config.confirmations, 1, type(uint8).max, 0, requiredDVNs, new address[](0)
        );

        SetConfigParam[] memory params = new SetConfigParam[](2);
        params[0] = SetConfigParam(remoteEid, EXECUTOR_CONFIG_TYPE, abi.encode(executorConfig));
        params[1] = SetConfigParam(remoteEid, ULN_CONFIG_TYPE, abi.encode(ulnConfig));

        endpointContract.setConfig(oapp, config.sendLib, params);

        emit DVNConfigured(salt, oapp, config);
    }

    /**
     * @notice Internal function to setup LayerZero peer on the deployed pair
     * @param salt The salt of the deployed pair
     * @param networkType The network type of the pair
     * @dev The factory is the owner of the pair, so it can call setPeer
     */
    function _setupLayerZeroPeer(bytes32 salt, NetworkType networkType) internal {
        address oapp = deployedPairs[salt];
        if (oapp == address(0)) {
            revert PairNotDeployed(salt);
        }

        // Determine EIDs based on current network (testnet or mainnet)
        uint256 chainId = block.chainid;
        bool isTestnetNetwork = chainId == CHAIN_ID_ARBITRUM_SEPOLIA || chainId == CHAIN_ID_BASE_SEPOLIA;
        
        uint32 remoteEid;
        if (networkType == NetworkType.ARBITRUM) {
            remoteEid = isTestnetNetwork ? BASE_EID_TESTNET : BASE_EID_MAINNET;
        } else {
            remoteEid = isTestnetNetwork ? ARBITRUM_EID_TESTNET : ARBITRUM_EID_MAINNET;
        }

        // Set peer: the pair address on the other network (same address due to CREATE3)
        bytes32 peerAddress = bytes32(uint256(uint160(oapp)));
        
        // Call setPeer directly - factory is owner so it has permissions
        // Use the interface to call setPeer on either SimpleOAppArbitrum or SimpleOAppBaseNetwork
        IOAppCore(oapp).setPeer(remoteEid, peerAddress);
    }
    
    /**
     * @notice Setup LayerZero peer for an existing pair (owner only)
     * @param salt The salt of the deployed pair
     * @dev Allows the factory owner to setup the peer for pairs that were created before
     *      the automatic peer setup was implemented
     */
    function setupPeerForPair(bytes32 salt) external onlyOwner {
        address oapp = deployedPairs[salt];
        if (oapp == address(0)) {
            revert PairNotDeployed(salt);
        }
        
        NetworkType networkType = pairNetworkType[salt];
        
        // Determine EIDs based on current network (testnet or mainnet)
        uint256 chainId = block.chainid;
        bool isTestnetNetwork = chainId == CHAIN_ID_ARBITRUM_SEPOLIA || chainId == CHAIN_ID_BASE_SEPOLIA;
        
        uint32 remoteEid;
        if (networkType == NetworkType.ARBITRUM) {
            remoteEid = isTestnetNetwork ? BASE_EID_TESTNET : BASE_EID_MAINNET;
        } else {
            remoteEid = isTestnetNetwork ? ARBITRUM_EID_TESTNET : ARBITRUM_EID_MAINNET;
        }
        
        // Set peer: the pair address on the other network (same address due to CREATE3)
        bytes32 peerAddress = bytes32(uint256(uint160(oapp)));
        IOAppCore(oapp).setPeer(remoteEid, peerAddress);
    }

    // ============ Errors ============
    error PairAlreadyExists(bytes32 salt);
    error DeploymentFailed();
    error InvalidNetworkType();
    error UnsupportedChainId(uint256 chainId);
    error PairNotDeployed(bytes32 salt);
    error InvalidAddress(string parameter);
    error InvalidConfirmations(uint64 confirmations);
    error InvalidMaxMessageSize(uint32 maxMessageSize);
}

