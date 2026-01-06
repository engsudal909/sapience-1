# TokenBridge Deployment Scripts

This directory contains scripts to deploy and test the TokenBridge contract on test networks.

## Overview

The TokenBridge deployment consists of:
1. Deploying TokenBridge on PM (Prediction Market) side
2. Deploying TokenBridge on SM (Secondary Market) side
3. Configuring both bridges to trust each other
4. Creating a test token pair
5. Running verification tests

## Prerequisites

- Foundry installed (`forge`, `cast`)
- `jq` installed for JSON parsing
- Environment variables configured (see `ENV_EXAMPLE`)
- Access to RPC endpoints for both chains
- Private keys for deployment accounts
- LayerZero endpoints deployed on both chains

## Setup

1. Copy `ENV_EXAMPLE` to `.env.deployments` in the protocol root:
   ```bash
   cp src/scripts/DeployTokenBridge/ENV_EXAMPLE ../../.env.deployments
   ```

2. Fill in the environment variables:
   ```bash
   # PM Side
   export PM_PRIVATE_KEY=0x...
   export PM_RPC=https://...
   export PM_LZ_ENDPOINT=0x...
   export PM_OWNER=0x...
   export PM_EID=12345

   # SM Side
   export SM_PRIVATE_KEY=0x...
   export SM_RPC=https://...
   export SM_LZ_ENDPOINT=0x...
   export SM_OWNER=0x...
   export SM_EID=67890
   ```

## Usage

### Option 1: Automated Deployment (Recommended)

Run the all-in-one script:

```bash
cd packages/protocol
bash src/scripts/DeployTokenBridge/deploy_and_test.sh
```

This will:
- Deploy both bridges
- Configure them
- Create a test token pair
- Run verification tests

### Option 2: Manual Step-by-Step Deployment

#### Step 1: Deploy PM Bridge

```bash
cd packages/protocol
forge script src/scripts/DeployTokenBridge/DeployTokenBridgePMSide.s.sol:DeployTokenBridgePMSide \
  --rpc-url $PM_RPC \
  --broadcast \
  --verify
```

Save the deployed address as `PM_BRIDGE`.

#### Step 2: Deploy SM Bridge

```bash
forge script src/scripts/DeployTokenBridge/DeployTokenBridgeSMSide.s.sol:DeployTokenBridgeSMSide \
  --rpc-url $SM_RPC \
  --broadcast \
  --verify
```

Save the deployed address as `SM_BRIDGE`.

#### Step 3: Configure Bridges

```bash
export PM_BRIDGE=0x...
export SM_BRIDGE=0x...

# Configure PM side
forge script src/scripts/DeployTokenBridge/ConfigureTokenBridgePMSide.s.sol:ConfigureTokenBridgePMSide \
  --rpc-url $PM_RPC \
  --broadcast

# Configure SM side
forge script src/scripts/DeployTokenBridge/ConfigureTokenBridgeSMSide.s.sol:ConfigureTokenBridgeSMSide \
  --rpc-url $SM_RPC \
  --broadcast
```

#### Step 4: Create Test Token Pair

```bash
forge script src/scripts/DeployTokenBridge/CreateTokenPair.s.sol:CreateTokenPair \
  --rpc-url $PM_RPC \
  --broadcast
```

#### Step 5: Verify Deployment

```bash
# Set token address if you want to verify token pair
export TEST_TOKEN_ADDRESS=0x...

forge script src/scripts/DeployTokenBridge/VerifyTokenBridge.s.sol:VerifyTokenBridge \
  --rpc-url $PM_RPC
```

## Testing

After deployment, you can test the bridge functionality:

### 1. Verify Token Pair Creation

```bash
cast call $PM_BRIDGE "getTokenPair(address)(address,address,bool,bool)" $TOKEN_ADDRESS --rpc-url $PM_RPC
```

### 2. Check Bridge Configuration

```bash
cast call $PM_BRIDGE "getBridgeConfig()(uint32,address)" --rpc-url $PM_RPC
```

### 3. Test Bridging (after token pair is acknowledged)

```bash
# Approve tokens
cast send $TOKEN_ADDRESS "approve(address,uint256)" $PM_BRIDGE $AMOUNT \
  --rpc-url $PM_RPC \
  --private-key $USER_PRIVATE_KEY

# Bridge tokens
cast send $PM_BRIDGE "bridgeTokens(address,uint256)" $TOKEN_ADDRESS $AMOUNT \
  --rpc-url $PM_RPC \
  --private-key $USER_PRIVATE_KEY
```

## LayerZero EIDs

Common LayerZero EIDs for testnets:
- Sepolia: 40161
- Base Sepolia: 40245
- Arbitrum Sepolia: 40231
- Optimism Sepolia: 40232
- Polygon Mumbai: 40109

## Troubleshooting

### Bridge Not Receiving Messages

1. Verify LayerZero endpoints are configured correctly
2. Check that peers are set on both sides:
   ```bash
   cast call $PM_BRIDGE "peers(uint32)(bytes32)" $SM_EID --rpc-url $PM_RPC
   ```
3. Ensure sufficient gas/native tokens for LayerZero fees

### Token Pair Not Acknowledged

1. Wait for LayerZero message delivery (can take several minutes)
2. Check LayerZero explorer for message status
3. Verify both bridges are configured correctly

### Deployment Fails

1. Check RPC endpoints are accessible
2. Verify private keys have sufficient balance
3. Ensure LayerZero endpoints exist on both chains
4. Check network compatibility (both chains must support CREATE2)

## Files

- `DeployTokenBridgePMSide.s.sol` - Deploy PM side bridge
- `DeployTokenBridgeSMSide.s.sol` - Deploy SM side bridge
- `ConfigureTokenBridgePMSide.s.sol` - Configure PM side bridge
- `ConfigureTokenBridgeSMSide.s.sol` - Configure SM side bridge
- `CreateTokenPair.s.sol` - Create a test token pair
- `CheckTokenPairAck.s.sol` - Check token pair acknowledgment status
- `VerifyTokenBridge.s.sol` - Verify bridge deployment and token pair status
- `deploy_and_test.sh` - Automated deployment script with wait loop
- `ENV_EXAMPLE` - Environment variable template

## Wait Loop Feature

The `deploy_and_test.sh` script includes an automated wait loop that:
- Polls both PM and SM bridges every 10 seconds (configurable)
- Checks if the token pair is acknowledged on both sides
- Continues automatically once LayerZero messages are delivered
- Times out after 5 minutes (configurable) if messages don't arrive

You can configure the wait behavior with environment variables:
```bash
export MAX_WAIT_TIME=600    # Maximum wait time in seconds (default: 300)
export CHECK_INTERVAL=5     # Check interval in seconds (default: 10)
```

## Notes

- Token pairs can only be created on the PM side
- Both bridges must be deployed before configuration
- Token pair acknowledgment requires LayerZero message delivery
- Bridge addresses should be deterministic if using CREATE2 for deployment

