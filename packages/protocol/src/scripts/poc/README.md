# OAppFactory Deployment Scripts

This directory contains scripts to deploy the `OAppFactory` contract on both networks (Arbitrum and Base) at the same address.

## Why Same Address?

For CREATE3 to work correctly and produce the same pair addresses on both networks, the factory must be deployed at the same address on both networks.

## Deployment Options

### Option 1: Same Deployer + Nonce (Simple)

**Script**: `DeployOAppFactory.s.sol`

This is the simplest approach but requires careful nonce management.

**Steps:**

1. **Prepare environment variables** (create `.env` file):
```bash
DEPLOYER_ADDRESS=0xYourDeployerAddress
DEPLOYER_PRIVATE_KEY=0xYourPrivateKey
```

2. **Check nonces on both networks**:
   - Arbitrum: Check your deployer address on [Arbiscan](https://arbiscan.io)
   - Base: Check your deployer address on [Basescan](https://basescan.org)

3. **Match nonces** (if they differ):
   - Send dummy transactions on the network with the lower nonce until both match
   - Or deploy on the network with the lower nonce first

4. **Deploy on Arbitrum**:
```bash
forge script src/scripts/poc/DeployOAppFactory.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --broadcast \
  --verify
```

5. **Deploy on Base** (with same nonce):
```bash
forge script src/scripts/poc/DeployOAppFactory.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify
```

**Pros:**
- Simple, no additional contracts needed
- Works with standard deployment tools

**Cons:**
- Requires nonce management
- Can be error-prone if nonces get out of sync

### Option 2: Deterministic Deployment Proxy (DDP) - Recommended

**Script**: `DeployOAppFactoryWithDDP.s.sol`

This uses a Deterministic Deployment Proxy (DDP) that exists at the same address on all EVM chains. This is the most reliable method.

**Steps:**

1. **Prepare environment variables**:
```bash
DEPLOYER_ADDRESS=0xYourDeployerAddress
DEPLOYER_PRIVATE_KEY=0xYourPrivateKey
```

2. **Deploy on Arbitrum**:
```bash
forge script src/scripts/poc/DeployOAppFactoryWithDDP.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --broadcast \
  --verify
```

3. **Deploy on Base** (will get same address):
```bash
forge script src/scripts/poc/DeployOAppFactoryWithDDP.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify
```

**Pros:**
- Guaranteed same address on all networks
- No nonce management needed
- Industry standard approach

**Cons:**
- Requires the DDP to exist on both networks (it does, at `0x4e59b44847b379578588920cA78FbF26c0B4956C`)

## Verifying Deployment

After deployment, verify the factory address is the same on both networks:

```bash
# Check on Arbitrum
cast code <FACTORY_ADDRESS> --rpc-url $ARBITRUM_RPC_URL

# Check on Base
cast code <FACTORY_ADDRESS> --rpc-url $BASE_RPC_URL
```

Both should return the same bytecode.

## Testing Scripts

After deploying the factory, use these scripts to test the PoC:

### TestOAppFactory.s.sol

Main test script that performs the full setup and testing flow:

```bash
# Set environment variables
export FACTORY_ADDRESS=0xYourFactoryAddress
export DEPLOYER_PRIVATE_KEY=0xYourPrivateKey

# Run on Arbitrum
forge script src/scripts/poc/TestOAppFactory.s.sol \
  --rpc-url $ARBITRUM_RPC_URL

# Run on Base
forge script src/scripts/poc/TestOAppFactory.s.sol \
  --rpc-url $BASE_RPC_URL
```

This script will:
1. Check if pair exists, create if needed
2. Setup LayerZero configuration
3. Get quote for sending values
4. Display current status

### SendValueCrossChain.s.sol

Send a value from one network to another:

```bash
# Optional: Set custom value (default: 12345)
export VALUE_TO_SEND=99999

# Send from Arbitrum to Base
forge script src/scripts/poc/SendValueCrossChain.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --broadcast

# Or send from Base to Arbitrum
forge script src/scripts/poc/SendValueCrossChain.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast
```

### CheckReceivedValue.s.sol

Check if a value was received (view-only, no broadcast needed):

```bash
# Check on Arbitrum
forge script src/scripts/poc/CheckReceivedValue.s.sol \
  --rpc-url $ARBITRUM_RPC_URL

# Check on Base
forge script src/scripts/poc/CheckReceivedValue.s.sol \
  --rpc-url $BASE_RPC_URL
```

## Complete Test Flow

1. **Deploy factory on both networks** (see deployment section above)

2. **Run TestOAppFactory on both networks**:
   ```bash
   # Arbitrum
   forge script src/scripts/poc/TestOAppFactory.s.sol --rpc-url $ARBITRUM_RPC_URL --broadcast
   
   # Base
   forge script src/scripts/poc/TestOAppFactory.s.sol --rpc-url $BASE_RPC_URL --broadcast
   ```

3. **Send a value from one network**:
   ```bash
   forge script src/scripts/poc/SendValueCrossChain.s.sol --rpc-url $ARBITRUM_RPC_URL --broadcast
   ```

4. **Wait for LayerZero delivery** (usually 2-5 minutes, check on [LayerZero Scan](https://layerzeroscan.com))

5. **Check received value on destination network**:
   ```bash
   forge script src/scripts/poc/CheckReceivedValue.s.sol --rpc-url $BASE_RPC_URL
   ```

## Next Steps

After deploying the factory on both networks:

1. Configure default DVN settings (see main README)
2. Create pairs using the same salt on both networks
3. Setup LayerZero on each deployed pair
4. Test cross-chain communication using the test scripts above

## Troubleshooting

### Factory addresses don't match

- **If using Option 1**: Check that nonces match on both networks
- **If using Option 2**: Verify the DDP exists on both networks and the salt is the same

### Deployment fails

- Check that you have sufficient ETH for gas on both networks
- Verify environment variables are set correctly
- Ensure the deployer address has the required permissions

