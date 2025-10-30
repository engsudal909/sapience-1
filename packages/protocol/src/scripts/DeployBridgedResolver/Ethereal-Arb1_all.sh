#!/usr/bin/env bash
set -euo pipefail

# Required env vars:
#   PRIVATE_KEY        - EOA private key for broadcasting
#   ETHEREAL_RPC       - RPC URL for Ethereal chain
#   ARB_RPC            - RPC URL for Arbitrum One
#   UMA_SIDE_EID       - Arbitrum One LayerZero EID (e.g., 30110)
#   PM_SIDE_EID        - Ethereal LayerZero EID

# Resolve directories relative to current working directory
SCRIPTS_DIR=$(pwd -P)
BROADCAST_DIR="$SCRIPTS_DIR/broadcast"

# Load .env files from packages/protocol before validating env
ENV_DIR="$SCRIPTS_DIR"
if [[ -f "$ENV_DIR/.env" || -f "$ENV_DIR/.env.local" ]]; then
  echo "Loading environment from $ENV_DIR/.env*"
  set -a
  [[ -f "$ENV_DIR/.env" ]] && source "$ENV_DIR/.env"
  [[ -f "$ENV_DIR/.env.local" ]] && source "$ENV_DIR/.env.local"
  set +a
fi

missing()
{
  [[ -z "${PRIVATE_KEY:-}" || -z "${ETHEREAL_RPC:-}" || -z "${ARB_RPC:-}" || -z "${UMA_SIDE_EID:-}" || -z "${PM_SIDE_EID:-}" ]]
}

if missing; then
  cat >&2 <<'USAGE'
Required environment variables are not set. Please export the following and re-run:

export PRIVATE_KEY=0x...
export ETHEREAL_RPC=https://etherealchain.rpc.url
export ARB_RPC=https://arb1.arbitrum.io/rpc
export UMA_SIDE_EID=30110           # Arbitrum One eid
export PM_SIDE_EID=<ethereal_eid>   # Ethereal eid
# Optional UMA params:
# export UMA_OOV3=0x...
# export UMA_BOND_TOKEN=0x...
# export UMA_BOND_AMOUNT=1000000000000000000
# export UMA_ASSERTION_LIVENESS=3600
# export UMA_ASSERTER=0x...

cd packages/protocol/src/scripts/DeployBridgedResolver
bash Ethereal-Arb1_all.sh
USAGE
  exit 1
fi

# Ensure running from packages/protocol/src/scripts/DeployBridgedResolver
if [[ ! -f "Ethereal-Arb1_all.sh" ]]; then
  cat >&2 <<'USAGE'
Please run from packages/protocol/src/scripts/DeployBridgedResolver

cd packages/protocol/src/scripts/DeployBridgedResolver
bash Ethereal-Arb1_all.sh
USAGE
  exit 1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }
}

need jq

exit 0

echo "[1/4] Deploy PM LZ Resolver on Ethereal"
forge script \
  Ethereal-Arb1_deployPredictionMarketLZResolver.s.sol \
  --rpc-url "$ETHEREAL_RPC" \
  --broadcast \
  --verify

# Extract PM resolver address from broadcast JSON
PM_RUN_JSON=$(ls -td "$BROADCAST_DIR"/Ethereal-Arb1_deployPredictionMarketLZResolver.s.sol/*/run-latest.json 2>/dev/null | head -n1)
export PM_LZ_RESOLVER=$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$PM_RUN_JSON" | head -n1)
if [[ -z "$PM_LZ_RESOLVER" || "$PM_LZ_RESOLVER" == "null" ]]; then
  echo "Failed to extract PM_LZ_RESOLVER from $PM_RUN_JSON" >&2
  exit 1
fi
echo "PM_LZ_RESOLVER=$PM_LZ_RESOLVER"

echo "[2/4] Deploy UMA-side Resolver on Arbitrum"
forge script \
  Ethereal-Arb1_deployPredictionMarketLZResolverUmaSide.s.sol \
  --rpc-url "$ARB_RPC" \
  --broadcast \
  --verify

# Extract UMA-side resolver address from broadcast JSON
UMA_RUN_JSON=$(ls -td "$BROADCAST_DIR"/Ethereal-Arb1_deployPredictionMarketLZResolverUmaSide.s.sol/*/run-latest.json 2>/dev/null | head -n1)
export UMA_SIDE_RESOLVER=$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$UMA_RUN_JSON" | head -n1)
if [[ -z "$UMA_SIDE_RESOLVER" || "$UMA_SIDE_RESOLVER" == "null" ]]; then
  echo "Failed to extract UMA_SIDE_RESOLVER from $UMA_RUN_JSON" >&2
  exit 1
fi
echo "UMA_SIDE_RESOLVER=$UMA_SIDE_RESOLVER"

# EIDs are required and already validated above

echo "[3/4] Configure PM LZ Resolver on Ethereal"
forge script \
  Ethereal-Arb1_configurePredictionMarketLZResolver.s.sol \
  --rpc-url "$ETHEREAL_RPC" \
  --broadcast

echo "[4/4] Configure UMA-side Resolver on Arbitrum"
forge script \
  Ethereal-Arb1_configurePredictionMarketLZResolverUmaSide.s.sol \
  --rpc-url "$ARB_RPC" \
  --broadcast

echo "Done."


