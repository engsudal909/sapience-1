#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Verify PredictionMarketLZConditionalTokensResolver on Arbitrum One
# ============================================================================
#
# This script verifies the deployed resolver contract on Arbitrum One
# using the constructor arguments from the deployment broadcast.
#
# Prerequisites:
#   - ETHERSCAN_API_KEY set in environment or .env.deployments
#   - cast installed (for encoding constructor args)
#
# Usage:
#   bash src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_verifyContract.sh
#
# ============================================================================

# Resolve directories
SCRIPT_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
PROTOCOL_DIR=$(cd "$SCRIPT_PATH/../../.." && pwd -P)

# Load .env files
if [[ -f "$PROTOCOL_DIR/.env.deployments" ]]; then
  echo "Loading environment from $PROTOCOL_DIR/.env.deployments"
  set -a
  source "$PROTOCOL_DIR/.env.deployments"
  set +a
fi

# Check for ETHERSCAN_API_KEY
if [[ -z "${ETHERSCAN_API_KEY:-}" ]]; then
  echo "ERROR: ETHERSCAN_API_KEY is not set"
  echo ""
  echo "Please set it in your environment or .env.deployments file:"
  echo "  export ETHERSCAN_API_KEY=your_api_key_here"
  exit 1
fi

# Contract details
CONTRACT_ADDRESS="0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6"
CONTRACT_PATH="src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol:PredictionMarketLZConditionalTokensResolver"
CHAIN_ID=42161

# Constructor arguments (from deployment broadcast)
ENDPOINT="0x1a44076050125825900e736c501f859c50fE728c"
OWNER="0xdb5Af497A73620d881561eDb508012A5f84e9BA2"
MAX_MARKETS=10
READ_CHANNEL_EID=30110
TARGET_EID=30109
CONDITIONAL_TOKENS="0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
CONFIRMATIONS=15
LZ_READ_GAS=200000
LZ_READ_RESULT_SIZE=32

echo "=== Verifying PredictionMarketLZConditionalTokensResolver ==="
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Chain ID: $CHAIN_ID"
echo ""

# Encode constructor arguments
echo "Encoding constructor arguments..."
CONSTRUCTOR_ARGS=$(cast abi-encode \
  "constructor(address,address,(uint256,uint32,uint32,address,uint16,uint128,uint32))" \
  "$ENDPOINT" \
  "$OWNER" \
  "($MAX_MARKETS,$READ_CHANNEL_EID,$TARGET_EID,$CONDITIONAL_TOKENS,$CONFIRMATIONS,$LZ_READ_GAS,$LZ_READ_RESULT_SIZE)")

if [[ $? -ne 0 ]]; then
  echo "ERROR: Failed to encode constructor arguments"
  exit 1
fi

echo "Constructor args encoded successfully"
echo ""

# Verify the contract
echo "Verifying contract on Arbitrum One..."
cd "$PROTOCOL_DIR"

forge verify-contract \
  "$CONTRACT_ADDRESS" \
  "$CONTRACT_PATH" \
  --chain-id "$CHAIN_ID" \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --constructor-args "$CONSTRUCTOR_ARGS"

if [[ $? -eq 0 ]]; then
  echo ""
  echo "✅ Contract verified successfully!"
  echo "View on Arbiscan: https://arbiscan.io/address/$CONTRACT_ADDRESS#code"
else
  echo ""
  echo "❌ Verification failed. Check the error message above."
  exit 1
fi

