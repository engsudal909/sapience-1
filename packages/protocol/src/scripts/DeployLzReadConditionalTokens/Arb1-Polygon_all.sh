#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# End-to-end lzRead smoke test: Arbitrum One → Polygon ConditionalTokens
# ============================================================================
#
# This script:
#   1. Deploys PredictionMarketLZConditionalTokensResolver on Arbitrum One
#   2. Enables lzRead channel and sends requestResolution() for known conditionIds
#   3. Optionally polls for resolution completion
#
# Prerequisites:
#   - jq installed
#   - Environment variables set (see ENV_EXAMPLE)
#
# Usage:
#   bash src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_all.sh
#
# ============================================================================

# Resolve directories
SCRIPT_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
PROTOCOL_DIR=$(cd "$SCRIPT_PATH/../../.." && pwd -P)
BROADCAST_DIR="$PROTOCOL_DIR/broadcast"

# Load .env files
if [[ -f "$PROTOCOL_DIR/.env.deployments" ]]; then
  echo "Loading environment from $PROTOCOL_DIR/.env.deployments"
  set -a
  source "$PROTOCOL_DIR/.env.deployments"
  set +a
fi

# ============================================================================
# Validate required environment variables
# ============================================================================
missing() {
  [[ -z "${ARB_PRIVATE_KEY:-}" \
  || -z "${ARB_RPC:-}" \
  || -z "${ARB_LZ_ENDPOINT:-}" \
  || -z "${ARB_OWNER:-}" ]]
}

if missing; then
  cat >&2 <<'USAGE'
Required environment variables are not set. Please export the following and re-run:

export ARB_PRIVATE_KEY=0x...
export ARB_RPC=https://arb1.arbitrum.io/rpc
export ARB_LZ_ENDPOINT=0x1a44076050125825900e736c501f859c50fE728c
export ARB_OWNER=0x...

Optional (with defaults):
export READ_CHANNEL_EID=30110        # Arbitrum One V2 EID
export POLYGON_EID=30109             # Polygon PoS V2 EID
export POLYGON_CTF=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
export CONDITION_YES=0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc
export CONDITION_NO=0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e

Run from packages/protocol:
  bash src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_all.sh
USAGE
  exit 1
fi

# Check dependencies
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }
}
need jq
need forge

echo "=============================================="
echo "lzRead Smoke Test: Arbitrum One → Polygon CTF"
echo "=============================================="
echo ""

# ============================================================================
# Step 1: Deploy the resolver
# ============================================================================
echo "[1/5] Deploying PredictionMarketLZConditionalTokensResolver on Arbitrum One..."
(cd "$PROTOCOL_DIR" && forge script \
  src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_deployResolver.s.sol \
  --rpc-url "$ARB_RPC" \
  --broadcast \
  --private-key "$ARB_PRIVATE_KEY")

# Extract deployed resolver address from broadcast JSON
DEPLOY_RUN_JSON=$(ls -td "$BROADCAST_DIR"/Arb1-Polygon_deployResolver.s.sol/*/run-latest.json 2>/dev/null | head -n1)
if [[ -z "$DEPLOY_RUN_JSON" ]]; then
  echo "ERROR: Could not find broadcast JSON for deploy script" >&2
  exit 1
fi

export RESOLVER=$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$DEPLOY_RUN_JSON" | head -n1)
if [[ -z "$RESOLVER" || "$RESOLVER" == "null" ]]; then
  echo "ERROR: Failed to extract RESOLVER address from $DEPLOY_RUN_JSON" >&2
  exit 1
fi

echo ""
echo "Resolver deployed at: $RESOLVER"
echo ""

# ============================================================================
# Step 2: Configure resolver (set peer and enable read channel)
# ============================================================================
echo "[2/5] Configuring resolver (setting peer and enabling read channel)..."
(cd "$PROTOCOL_DIR" && forge script \
  src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_configureResolver.s.sol \
  --rpc-url "$ARB_RPC" \
  --broadcast \
  --private-key "$ARB_PRIVATE_KEY")

echo ""
echo "Resolver configured!"
echo ""

# ============================================================================
# Step 3: Configure LayerZero executor/DVN for read channel
# ============================================================================
echo "[3/5] Configuring LayerZero executor and DVN for read channel..."
echo ""
echo "NOTE: If this step fails with executor fee errors, try the minimal config:"
echo "  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfigMinimal.s.sol \\"
echo "    --rpc-url \$ARB_RPC --broadcast --private-key \$ARB_PRIVATE_KEY"
echo ""

# Try fixed config first (uses address(0) executor), minimal as fallback
CONFIG_SCRIPT="Arb1-Polygon_setLzReadConfigFixed.s.sol"
if [[ -n "${USE_MINIMAL_CONFIG:-}" ]]; then
  CONFIG_SCRIPT="Arb1-Polygon_setLzReadConfigMinimal.s.sol"
  echo "Using minimal configuration (no executor config)..."
elif [[ -n "${USE_FULL_CONFIG:-}" ]]; then
  CONFIG_SCRIPT="Arb1-Polygon_setLzReadConfig.s.sol"
  echo "Using full configuration (explicit executor)..."
fi

(cd "$PROTOCOL_DIR" && forge script \
  "src/scripts/DeployLzReadConditionalTokens/$CONFIG_SCRIPT" \
  --rpc-url "$ARB_RPC" \
  --broadcast \
  --private-key "$ARB_PRIVATE_KEY") || {
  echo ""
  echo "WARNING: Configuration failed. This may be due to executor fee calculation issues."
  echo "Try using minimal configuration instead:"
  echo "  USE_MINIMAL_CONFIG=1 bash $0"
  echo ""
  echo "Or try the fixed config (address(0) executor):"
  echo "  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfigFixed.s.sol \\"
  echo "    --rpc-url \$ARB_RPC --broadcast --private-key \$ARB_PRIVATE_KEY"
  echo ""
  echo "Or minimal config (no executor):"
  echo "  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfigMinimal.s.sol \\"
  echo "    --rpc-url \$ARB_RPC --broadcast --private-key \$ARB_PRIVATE_KEY"
  exit 1
}

echo ""
echo "LayerZero infrastructure configured!"
echo ""

# ============================================================================
# Step 4: Test fee quoting (diagnostic)
# ============================================================================
echo "[4/6] Testing fee quoting (diagnostic)..."
(cd "$PROTOCOL_DIR" && forge script \
  src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \
  --rpc-url "$ARB_RPC") || {
  echo ""
  echo "ERROR: Fee quoting failed. This indicates executor configuration issues."
  echo "See TROUBLESHOOTING.md for solutions."
  exit 1
}

echo ""
echo "Fee quoting successful!"
echo ""

# ============================================================================
# Step 5: Request resolution
# ============================================================================
echo "[5/6] Requesting resolution for known conditionIds..."
(cd "$PROTOCOL_DIR" && forge script \
  src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_requestResolution.s.sol \
  --rpc-url "$ARB_RPC" \
  --broadcast \
  --private-key "$ARB_PRIVATE_KEY")

echo ""
echo "Resolution requests sent!"
echo ""

# ============================================================================
# Step 6: Wait and verify
# ============================================================================
echo "[6/6] Waiting for LayerZero callbacks..."
echo ""
echo "The lzRead callbacks typically take 30-120 seconds to complete."
echo ""

# Optional: poll for completion
POLL_INTERVAL=15
MAX_ATTEMPTS=20
ATTEMPT=0

while [[ $ATTEMPT -lt $MAX_ATTEMPTS ]]; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS: Checking resolver state..."
  
  # Run verify script (read-only, no broadcast)
  OUTPUT=$(cd "$PROTOCOL_DIR" && forge script \
    src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_verifyResolverState.s.sol \
    --rpc-url "$ARB_RPC" 2>&1) || true
  
  # Check if both conditions are settled
  if echo "$OUTPUT" | grep -q "SUCCESS: Both conditions verified correctly"; then
    echo ""
    echo "$OUTPUT"
    echo ""
    echo "=============================================="
    echo "SMOKE TEST PASSED!"
    echo "=============================================="
    echo "Resolver: $RESOLVER"
    echo ""
    exit 0
  fi
  
  # Check if still pending
  if echo "$OUTPUT" | grep -q "PENDING"; then
    echo "  Still pending... waiting ${POLL_INTERVAL}s"
    sleep $POLL_INTERVAL
  else
    # Some other state - print output and continue
    echo "$OUTPUT"
    echo ""
    echo "Unexpected state. Waiting ${POLL_INTERVAL}s..."
    sleep $POLL_INTERVAL
  fi
done

echo ""
echo "=============================================="
echo "TIMEOUT: Max polling attempts reached"
echo "=============================================="
echo ""
echo "The lzRead callbacks may still be in flight."
echo "You can manually verify by running:"
echo ""
echo "  export RESOLVER=$RESOLVER"
echo "  forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_verifyResolverState.s.sol \\"
echo "    --rpc-url \$ARB_RPC"
echo ""
exit 1

