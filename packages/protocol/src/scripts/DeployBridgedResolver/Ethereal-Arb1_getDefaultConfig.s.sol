// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ILayerZeroEndpointV2 } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { UlnConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import { ExecutorConfig } from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";

/// @title GetConfigScript
/// @notice Retrieves and logs the current configuration for the OApp.
contract GetConfigScript is Script {

    function run() external {
        string memory rpcUrl = "https://arb1.arbitrum.io/rpc";
        address endpoint = 0x1a44076050125825900e736c501f859c50fE728c;
        address oapp = 0x070Bd542474390c3AFED2DAE85C2d13932c75F17;
        address lib = 0x975bcD720be66659e3EB3C0e4F1866a3020E493A;
        uint32 eid = 30391;
        uint32 configType = 1;
        console.log("Getting Executor Config Arbitrum -> Ethereal");
        getConfig(rpcUrl, endpoint, oapp, lib, eid, configType);
        configType = 2;
        console.log("Getting ULN Config Arbitrum -> Ethereal");
        getConfig(rpcUrl, endpoint, oapp, lib, eid, configType);


        rpcUrl = "https://rpc.ethereal.trade";
        endpoint = 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B;
        oapp = 0xC873efA9D22A09e39101efB977C03011620bF015;
        lib = 0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043;
        eid = 30110;
        configType = 1;
        // console.log("Getting Executor Config Ethereal -> Arbitrum");
        // getConfig(rpcUrl, endpoint, oapp, lib, eid, configType);
        configType = 2;
        console.log("Getting ULN Config Ethereal -> Arbitrum");
        getConfig(rpcUrl, endpoint, oapp, lib, eid, configType);

    }

    function getConfig(
        string memory _rpcUrl,
        address _endpoint,
        address _oapp,
        address _lib,
        uint32 _eid,
        uint32 _configType
    ) internal {
        // Create a fork from the specified RPC URL.
        vm.createSelectFork(_rpcUrl);
        vm.startBroadcast();

        // Instantiate the LayerZero endpoint.
        ILayerZeroEndpointV2 endpoint = ILayerZeroEndpointV2(_endpoint);
        // Retrieve the raw configuration bytes.
        bytes memory config = endpoint.getConfig(_oapp, _lib, _eid, _configType);

        if (_configType == 1) {
            // Decode the Executor config (configType = 1)
            ExecutorConfig memory execConfig = abi.decode(config, (ExecutorConfig));
            // Log some key configuration parameters.
            console.log("Executor Type:", execConfig.maxMessageSize);
            console.log("Executor Address:", execConfig.executor);
        }

        if (_configType == 2) {
            // Decode the ULN config (configType = 2)
            UlnConfig memory decodedConfig = abi.decode(config, (UlnConfig));
            // Log some key configuration parameters.
            console.log("Confirmations:", decodedConfig.confirmations);
            console.log("Required DVN Count:", decodedConfig.requiredDVNCount);
            for (uint i = 0; i < decodedConfig.requiredDVNs.length; i++) {
                console.logAddress(decodedConfig.requiredDVNs[i]);
            }
            console.log("Optional DVN Count:", decodedConfig.optionalDVNCount);
            for (uint i = 0; i < decodedConfig.optionalDVNs.length; i++) {
                console.logAddress(decodedConfig.optionalDVNs[i]);
            }
            console.log("Optional DVN Threshold:", decodedConfig.optionalDVNThreshold);

        }
        vm.stopBroadcast();
    }
}