// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title DebugQuoteScript
 * @notice Deep diagnostic script to understand the quote error
 */
contract DebugQuoteScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    address constant ARB_LZ_ENDPOINT = 0x1a44076050125825900e736c501f859c50fE728c;
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;

    function run() external view {
        // All values are hardcoded - no env vars needed (read-only script)
        address resolverAddr = RESOLVER;
        address endpoint = ARB_LZ_ENDPOINT;
        
        PredictionMarketLZConditionalTokensResolver resolver = 
            PredictionMarketLZConditionalTokensResolver(payable(resolverAddr));
        
        console.log("=== Debugging Quote Error ===");
        console.log("Resolver:", resolverAddr);
        console.log("Endpoint:", endpoint);
        
        // Check resolver config
        (uint256 maxMarkets, uint32 readChannelEid, uint32 targetEid, address ctf, uint16 confirmations, uint128 gasLimit, uint32 resultSize) = resolver.config();
        console.log("");
        console.log("Resolver Config:");
        console.log("  readChannelEid:", readChannelEid);
        console.log("  targetEid:", targetEid);
        console.log("  conditionalTokens:", ctf);
        console.log("  confirmations:", confirmations);
        console.log("  lzReadGasLimit:", gasLimit);
        console.log("  lzReadResultSize:", resultSize);
        
        // Check endpoint configuration
        console.log("");
        console.log("Checking endpoint configuration...");
        address sendLib = ILayerZeroEndpointV2(endpoint).getSendLibrary(resolverAddr, readChannelEid);
        console.log("Send Library for read channel:", sendLib);
        
        // Try to quote directly
        console.log("");
        console.log("Attempting to quote...");
        try resolver.quoteResolution(CONDITION_YES) returns (MessagingFee memory fee) {
            console.log("SUCCESS!");
            console.log("Native fee:", fee.nativeFee);
            console.log("LZ token fee:", fee.lzTokenFee);
        } catch (bytes memory err) {
            console.log("Error caught:");
            console.log("  Length:", err.length);
            if (err.length >= 4) {
                bytes4 selector = bytes4(err);
                console.log("  Selector:", vm.toString(selector));
                console.log("  Selector (hex):", vm.toString(selector));
                
                // Try to decode as string
                if (err.length > 4) {
                    bytes memory data = new bytes(err.length - 4);
                    for (uint i = 0; i < data.length; i++) {
                        data[i] = err[i + 4];
                    }
                    console.log("  Data:", vm.toString(data));
                    
                    // Try to decode as uint256 (error code)
                    if (data.length >= 32) {
                        uint256 errorCode;
                        assembly {
                            errorCode := mload(add(data, 32))
                        }
                        console.log("  Possible error code:", errorCode);
                    }
                }
            }
            
            // Also try to call endpoint.quote directly to see what it says
            console.log("");
            console.log("Trying to call endpoint.quote directly...");
            // This would require building the message, but let's see if we can get more info
        }
    }
}

