#!/usr/bin/env bash
set -euo pipefail

# Deployment and testing script for TokenBridge
# This script deploys TokenBridge on both PM and SM sides, configures them,
# creates a test token pair, and runs basic tests.

# Required env vars:
#   PM_PRIVATE_KEY        - EOA private key for PM side
#   SM_PRIVATE_KEY        - EOA private key for SM side
#   PM_RPC                - RPC URL for PM chain
#   SM_RPC                - RPC URL for SM chain
#   PM_LZ_ENDPOINT        - LayerZero endpoint on PM chain
#   SM_LZ_ENDPOINT        - LayerZero endpoint on SM chain
#   PM_OWNER              - Owner address on PM side
#   SM_OWNER              - Owner address on SM side
#   PM_EID                - LayerZero EID for PM chain
#   SM_EID                - LayerZero EID for SM chain

# Resolve directories relative to script location
SCRIPT_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
SCRIPTS_DIR="$SCRIPT_PATH"
PROTOCOL_DIR=$(cd "$SCRIPT_PATH/../../.." && pwd -P)

# Load .env files from packages/protocol
ENV_DIR="$PROTOCOL_DIR"
if [[ -f "$ENV_DIR/.env.deployments" ]]; then
  echo "Loading environment from $ENV_DIR/.env*"
  set -a
  [[ -f "$ENV_DIR/.env.deployments" ]] && source "$ENV_DIR/.env.deployments"
  set +a
fi

missing()
{
  [[ -z "${PM_PRIVATE_KEY:-}" \
  || -z "${SM_PRIVATE_KEY:-}" \
  || -z "${PM_RPC:-}" \
  || -z "${SM_RPC:-}" \
  || -z "${PM_LZ_ENDPOINT:-}" \
  || -z "${SM_LZ_ENDPOINT:-}" \
  || -z "${PM_OWNER:-}" \
  || -z "${SM_OWNER:-}" \
  || -z "${PM_EID:-}" \
  || -z "${SM_EID:-}" ]]
}

if missing; then
  cat >&2 <<'USAGE'
Required environment variables are not set. Please export the following and re-run:

# PM Side (Prediction Market)
export PM_PRIVATE_KEY=0x...
export PM_RPC=https://pm-chain.rpc.url
export PM_LZ_ENDPOINT=0x...
export PM_OWNER=0x...
export PM_EID=12345

# SM Side (Secondary Market)
export SM_PRIVATE_KEY=0x...
export SM_RPC=https://sm-chain.rpc.url
export SM_LZ_ENDPOINT=0x...
export SM_OWNER=0x...
export SM_EID=67890

# Optional test parameters
export TEST_TOKEN_NAME="TestToken"
export TEST_TOKEN_SYMBOL="TTK"
export TEST_TOKEN_DECIMALS=18
export TEST_TOKEN_SALT=0x0000000000000000000000000000000000000000000000000000000000001234

# Run from packages/protocol:
bash src/scripts/DeployTokenBridge/deploy_and_test.sh
USAGE
  exit 1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }
}

need jq
need forge

echo "=========================================="
echo "TokenBridge Deployment and Test Script"
echo "=========================================="
echo ""

# Step 1: Deploy PM Bridge
echo "[1/5] Deploying TokenBridge on PM side..."
PM_BRIDGE_OUTPUT=$(cd "$SCRIPTS_DIR" && forge script \
  DeployTokenBridgePMSide.s.sol:DeployTokenBridgePMSide \
  --rpc-url "$PM_RPC" \
  --broadcast \
  --verify 2>&1)

PM_BRIDGE=$(echo "$PM_BRIDGE_OUTPUT" | grep -oP 'TokenBridge \(PM Side\) deployed to: \K0x[a-fA-F0-9]{40}' | head -1)

if [[ -z "$PM_BRIDGE" ]]; then
  echo "Failed to extract PM bridge address. Please check the deployment output:"
  echo "$PM_BRIDGE_OUTPUT"
  echo ""
  echo "Please manually set PM_BRIDGE environment variable and continue."
  exit 1
fi

if [[ -z "$PM_BRIDGE" ]]; then
  echo "Failed to extract PM bridge address. Please check the deployment output."
  exit 1
fi

echo "PM Bridge deployed to: $PM_BRIDGE"
export PM_BRIDGE

# Step 2: Deploy SM Bridge
echo ""
echo "[2/5] Deploying TokenBridge on SM side..."
SM_BRIDGE_OUTPUT=$(cd "$SCRIPTS_DIR" && forge script \
  DeployTokenBridgeSMSide.s.sol:DeployTokenBridgeSMSide \
  --rpc-url "$SM_RPC" \
  --broadcast \
  --verify 2>&1)

SM_BRIDGE=$(echo "$SM_BRIDGE_OUTPUT" | grep -oP 'TokenBridge \(SM Side\) deployed to: \K0x[a-fA-F0-9]{40}' | head -1)

if [[ -z "$SM_BRIDGE" ]]; then
  echo "Failed to extract SM bridge address. Please check the deployment output:"
  echo "$SM_BRIDGE_OUTPUT"
  echo ""
  echo "Please manually set SM_BRIDGE environment variable and continue."
  exit 1
fi

if [[ -z "$SM_BRIDGE" ]]; then
  echo "Failed to extract SM bridge address. Please check the deployment output."
  exit 1
fi

echo "SM Bridge deployed to: $SM_BRIDGE"
export SM_BRIDGE

# Step 3: Configure bridges
echo ""
echo "[3/5] Configuring bridges..."

# Configure PM side
echo "  Configuring PM side..."
(cd "$SCRIPTS_DIR" && forge script \
  ConfigureTokenBridgePMSide.s.sol:ConfigureTokenBridgePMSide \
  --rpc-url "$PM_RPC" \
  --broadcast) || {
  echo "Failed to configure PM bridge"
  exit 1
}

# Configure SM side
echo "  Configuring SM side..."
(cd "$SCRIPTS_DIR" && forge script \
  ConfigureTokenBridgeSMSide.s.sol:ConfigureTokenBridgeSMSide \
  --rpc-url "$SM_RPC" \
  --broadcast) || {
  echo "Failed to configure SM bridge"
  exit 1
}

echo "✓ Bridges configured"

# Step 4: Create test token pair
echo ""
echo "[4/6] Creating test token pair..."
TOKEN_OUTPUT=$(cd "$SCRIPTS_DIR" && forge script \
  CreateTokenPair.s.sol:CreateTokenPair \
  --rpc-url "$PM_RPC" \
  --broadcast 2>&1)

# Extract token address from output
TEST_TOKEN_ADDRESS=$(echo "$TOKEN_OUTPUT" | grep -oP 'Expected token address: \K0x[a-fA-F0-9]{40}' | head -1)

if [[ -z "$TEST_TOKEN_ADDRESS" ]]; then
  echo "⚠ Could not extract token address from output"
  echo "  Token pair was created, but address extraction failed"
  echo "  Please manually set TEST_TOKEN_ADDRESS and continue"
  exit 1
fi

echo "✓ Test token pair created at: $TEST_TOKEN_ADDRESS"
export TEST_TOKEN_ADDRESS

# Step 5: Wait for LayerZero message delivery
echo ""
echo "[5/6] Waiting for LayerZero message delivery..."
echo "  This may take a few minutes..."

MAX_WAIT_TIME=${MAX_WAIT_TIME:-300}  # Default 5 minutes
CHECK_INTERVAL=${CHECK_INTERVAL:-10}  # Check every 10 seconds
ELAPSED=0
ACK_STATUS=0

while [[ $ELAPSED -lt $MAX_WAIT_TIME ]]; do
  # Check acknowledgment status on both chains
  ACK_RESULT_PM=$(cd "$SCRIPTS_DIR" && forge script \
    CheckTokenPairAck.s.sol:CheckTokenPairAck \
    --rpc-url "$PM_RPC" \
    --json 2>/dev/null | jq -r '.returns."CheckTokenPairAck.run()" // "0"' 2>/dev/null || echo "0")
  
  ACK_RESULT_SM=$(cd "$SCRIPTS_DIR" && forge script \
    CheckTokenPairAck.s.sol:CheckTokenPairAck \
    --rpc-url "$SM_RPC" \
    --json 2>/dev/null | jq -r '.returns."CheckTokenPairAck.run()" // "0"' 2>/dev/null || echo "0")
  
  # Use the minimum status (most conservative)
  ACK_STATUS=${ACK_RESULT_PM:-0}
  if [[ ${ACK_RESULT_SM:-0} -lt $ACK_STATUS ]]; then
    ACK_STATUS=${ACK_RESULT_SM:-0}
  fi
  
  case $ACK_STATUS in
    0)
      echo "  [${ELAPSED}s] Token pair not found or address not set"
      ;;
    1)
      echo "  [${ELAPSED}s] Waiting for LayerZero message delivery... (PM: $ACK_RESULT_PM, SM: $ACK_RESULT_SM)"
      ;;
    2)
      echo "  [${ELAPSED}s] ✓ Token pair acknowledged on both sides!"
      break
      ;;
    *)
      echo "  [${ELAPSED}s] Checking status... (PM: $ACK_RESULT_PM, SM: $ACK_RESULT_SM)"
      ;;
  esac
  
  sleep $CHECK_INTERVAL
  ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

if [[ $ACK_STATUS -ne 2 ]]; then
  echo ""
  echo "⚠ Timeout waiting for LayerZero message delivery"
  echo "  Token pair may still be processing"
  echo "  You can manually check status later with:"
  echo "    export TEST_TOKEN_ADDRESS=$TEST_TOKEN_ADDRESS"
  echo "    forge script VerifyTokenBridge.s.sol:VerifyTokenBridge --rpc-url \$PM_RPC"
  echo ""
  echo "  Continuing with verification anyway..."
else
  echo "✓ LayerZero messages delivered successfully"
fi

# Step 6: Run verification tests
echo ""
echo "[6/6] Running verification tests..."
(cd "$SCRIPTS_DIR" && forge script \
  VerifyTokenBridge.s.sol:VerifyTokenBridge \
  --rpc-url "$PM_RPC") || {
  echo "Verification tests failed"
  exit 1
}

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "PM Bridge: $PM_BRIDGE"
echo "SM Bridge: $SM_BRIDGE"
echo ""
if [[ $ACK_STATUS -eq 2 ]]; then
  echo "✓ Token pair is fully acknowledged and ready for use!"
else
  echo "⚠ Token pair acknowledgment is pending"
  echo "  Run verification again later:"
  if [[ -n "${TEST_TOKEN_ADDRESS:-}" ]]; then
    echo "    export TEST_TOKEN_ADDRESS=$TEST_TOKEN_ADDRESS"
  fi
  echo "    forge script VerifyTokenBridge.s.sol:VerifyTokenBridge --rpc-url \$PM_RPC"
fi
echo ""
echo "Next steps:"
echo "1. Test bridging tokens between chains"
echo "2. Monitor bridge operations"
echo ""

