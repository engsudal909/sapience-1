// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title TestFeeQuoteScript
 * @notice Diagnostic script to test lzRead fee quoting without sending transactions
 * @dev This script helps diagnose executor configuration issues by testing fee calculation
 *      Run this after configuring LayerZero to see if fee quoting works.
 */
contract TestFeeQuoteScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    // Condition IDs from fork test (real Polymarket conditions)
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;
    bytes32 constant CONDITION_NO = 0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e;

    function run() external view {
        // All values are hardcoded - no env vars needed (read-only script)
        address resolverAddr = RESOLVER;
        bytes32 conditionYes = CONDITION_YES;
        bytes32 conditionNo = CONDITION_NO;

        PredictionMarketLZConditionalTokensResolver resolver = 
            PredictionMarketLZConditionalTokensResolver(payable(resolverAddr));

        console.log("=== Testing lzRead Fee Quoting ===");
        console.log("Resolver:", resolverAddr);
        console.log("");

        // Declare feeYes outside try block so it's accessible later
        MessagingFee memory feeYes;
        bool feeYesSuccess = false;

        // Try to quote fees
        try resolver.quoteResolution(conditionYes) returns (MessagingFee memory _feeYes) {
            feeYes = _feeYes;
            feeYesSuccess = true;
            console.log("SUCCESS: Fee quoting works!");
            console.log("");
            console.log("Fee for YES condition:");
            console.log("  Native fee:", feeYes.nativeFee);
            console.log("  LZ token fee:", feeYes.lzTokenFee);
        } catch Error(string memory reason) {
            console.log("ERROR: Fee quoting failed with reason:");
            console.log("  ", reason);
            console.log("");
            console.log("This suggests the executor configuration may be incorrect.");
            console.log("Try:");
            console.log("  1. Using the minimal config script (setLzReadConfigMinimal.s.sol)");
            console.log("  2. Checking LayerZero docs for lzRead executor requirements");
            console.log("  3. Testing on testnet first");
            return;
        } catch (bytes memory lowLevelData) {
            console.log("ERROR: Fee quoting failed with low-level error:");
            console.log("  Error data:", vm.toString(lowLevelData));
            console.log("");
            
            // Try to decode common errors
            if (lowLevelData.length >= 4) {
                bytes4 errorSelector = bytes4(lowLevelData);
                console.log("  Error selector:", vm.toString(errorSelector));
                
                // Common LayerZero error: .U (unexpected error)
                if (errorSelector == bytes4(0x2e0a2d4f)) { // .U selector (approximate)
                    console.log("");
                    console.log("This appears to be a LayerZero '.U' (unexpected) error.");
                    console.log("This typically means:");
                    console.log("  - Executor doesn't support lzRead operations");
                    console.log("  - Executor configuration is incorrect");
                    console.log("  - lzRead may need different executor or no explicit executor");
                }
            }
            
            console.log("");
            console.log("Troubleshooting steps:");
            console.log("  1. Try minimal config (no explicit executor):");
            console.log("     forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfigMinimal.s.sol \\");
            console.log("       --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY");
            console.log("");
            console.log("  2. Check if lzRead works on testnet first");
            console.log("");
            console.log("  3. Contact LayerZero support or check their docs for lzRead mainnet setup");
            return;
        }

        // If YES worked, try NO
        if (feeYesSuccess) {
            try resolver.quoteResolution(conditionNo) returns (MessagingFee memory feeNo) {
                console.log("Fee for NO condition:");
                console.log("  Native fee:", feeNo.nativeFee);
                console.log("  LZ token fee:", feeNo.lzTokenFee);
                console.log("");
                
                uint256 totalFee = feeYes.nativeFee + feeNo.nativeFee;
                console.log("Total fee for both conditions:", totalFee);
                console.log("");
                console.log("=== Fee Quoting Test PASSED ===");
                console.log("You can proceed with requestResolution()");
            } catch Error(string memory reason) {
            console.log("ERROR: Fee quoting for NO condition failed:");
            console.log("  ", reason);
        } catch (bytes memory lowLevelData) {
                console.log("ERROR: Fee quoting for NO condition failed with low-level error");
                console.log("  Error data:", vm.toString(lowLevelData));
            }
        }
    }
}

