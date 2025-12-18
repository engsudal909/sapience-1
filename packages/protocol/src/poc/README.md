# CREATE3 OApp Factory PoC

This Proof of Concept demonstrates how to deploy OApp contracts with the same address across different networks (e.g., Arbitrum and Base) using CREATE3.

## Overview

The PoC consists of the following components:

1. **CREATE3.sol** - Library for deterministic contract deployment
2. **SimpleOAppArbitrum.sol** - OApp implementation for Arbitrum network
3. **SimpleOAppBase.sol** - OApp implementation for Base network
4. **OAppFactory.sol** - Factory that uses CREATE3 to deploy the appropriate OApp based on network

## Architecture

### CREATE3 Pattern

CREATE3 allows deploying contracts to deterministic addresses by:
1. Deploying an intermediate deployer contract using CREATE2 (deterministic)
2. Using the deployer to deploy the target contract via CREATE (non-deterministic, but predictable)

The final address is computed as: `keccak256(0xd6, 0x94, deployer, 0x01) << 96`

### SimpleOApp Contracts

There are two versions of SimpleOApp, one for each network:

- **SimpleOAppArbitrum**: Uses Arbitrum LayerZero endpoint (0x6EDCE65403992e310A62460808c4b910D972f10f)
- **SimpleOAppBase**: Uses Base LayerZero endpoint (0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7)

Both contracts:
- Accept the factory address as constructor parameter
- Internally call `OApp` constructor with the appropriate endpoint
- Set the factory as the owner

### OAppFactory

The factory:
- Uses CREATE3 to deploy `SimpleOApp` contracts
- Automatically detects the network using `block.chainid` and selects the appropriate OApp implementation
- Supports explicit network type selection via `createPairWithType()`
- Ensures the same salt produces the same address across networks
- Tracks deployed pairs by salt and network type

## Usage

### 1. Deploy Factory on Both Networks

Deploy `OAppFactory` on both networks (Arbitrum and Base). **Important**: For CREATE3 to work correctly, the factory must be deployed at the same address on both networks.

**Quick Start:**

We provide deployment scripts in `src/scripts/poc/`:

1. **Option 1 - Simple (Same Deployer + Nonce)**:
   ```bash
   # Set environment variables
   export DEPLOYER_ADDRESS=0xYourAddress
   export DEPLOYER_PRIVATE_KEY=0xYourKey
   
   # Deploy on Arbitrum
   forge script src/scripts/poc/DeployOAppFactory.s.sol \
     --rpc-url $ARBITRUM_RPC_URL --broadcast --verify
   
   # Deploy on Base (ensure same nonce)
   forge script src/scripts/poc/DeployOAppFactory.s.sol \
     --rpc-url $BASE_RPC_URL --broadcast --verify
   ```

2. **Option 2 - Recommended (DDP)**:
   ```bash
   # Uses Deterministic Deployment Proxy for guaranteed same address
   forge script src/scripts/poc/DeployOAppFactoryWithDDP.s.sol \
     --rpc-url $ARBITRUM_RPC_URL --broadcast --verify
   
   forge script src/scripts/poc/DeployOAppFactoryWithDDP.s.sol \
     --rpc-url $BASE_RPC_URL --broadcast --verify
   ```

**See `src/scripts/poc/README.md` for detailed instructions and troubleshooting.**

### 2. Configure Default DVN (Optional but Recommended)

Before creating pairs, you can set default DVN configuration for each network type. This will automatically configure all pairs created for that network:

```solidity
// Configure for Arbitrum
factory.setDefaultDVNConfigWithDefaults(
    OAppFactory.NetworkType.ARBITRUM,
    arbitrumSendLib,
    arbitrumReceiveLib,
    arbitrumDVN,
    arbitrumExecutor
);

// Configure for Base
factory.setDefaultDVNConfigWithDefaults(
    OAppFactory.NetworkType.BASE,
    baseSendLib,
    baseReceiveLib,
    baseDVN,
    baseExecutor
);
```

**Note**: If you don't set default DVN config, pairs will still be created but won't have DVN configured. You can set the default config at any time, and it will apply to future pairs.

### 3. Create Pairs

#### Automatic Network Detection

The factory automatically detects the network and deploys the appropriate OApp:

```solidity
bytes32 salt = keccak256("MY_UNIQUE_SALT");
address pairAddress = factory.createPair(salt);
```

If default DVN config is set, the DVN will be automatically configured during deployment.

#### Explicit Network Type Selection

You can also explicitly specify the network type:

```solidity
bytes32 salt = keccak256("MY_UNIQUE_SALT");
address pairAddress = factory.createPairWithType(
    salt,
    OAppFactory.NetworkType.ARBITRUM  // or NetworkType.BASE
);
```

The `pairAddress` will be the same on both networks if:
- The factory is deployed at the same address on both networks, OR
- You account for the factory address difference in your salt calculation

**Note**: Each network will deploy its own version (SimpleOAppArbitrum or SimpleOAppBase) with the correct LayerZero endpoint for that network.

### 4. Setup LayerZero on Deployed Contracts

After deployment, call `setupLayerZero()` on each deployed contract (anyone can call this):

```solidity
// On Arbitrum
SimpleOAppArbitrum(pairAddress).setupLayerZero();

// On Base
SimpleOAppBase(pairAddress).setupLayerZero();
```

### 5. Test Cross-Chain Communication

Once setup is complete, you can test the LayerZero bridge by sending values between networks:

```solidity
// On Arbitrum - Send a value to Base
uint256 valueToSend = 12345;
uint256 fee = SimpleOAppArbitrum(pairAddress).quoteSendValue(valueToSend);
SimpleOAppArbitrum(pairAddress).sendValue{value: fee}(valueToSend);

// On Base - Check if value was received
uint256 receivedValue = SimpleOAppBase(pairAddress).getValue();
// receivedValue should be 12345 after the message is delivered

// On Base - Send a value back to Arbitrum
uint256 valueToSendBack = 67890;
uint256 feeBack = SimpleOAppBase(pairAddress).quoteSendValue(valueToSendBack);
SimpleOAppBase(pairAddress).sendValue{value: feeBack}(valueToSendBack);

// On Arbitrum - Check if value was received
uint256 receivedValueBack = SimpleOAppArbitrum(pairAddress).getValue();
// receivedValueBack should be 67890 after the message is delivered
```

## Testing

Run the tests with:

```bash
forge test --match-path test/poc/OAppFactory.t.sol -vvv
```

## Important Notes

1. **Factory Address**: For CREATE3 to produce the same address across networks, the factory must be deployed at the same address on both networks. This can be achieved by:
   - Using the same deployer address and nonce on both networks
   - Using a deterministic deployment proxy (DDP)
   - Using CREATE2 with a known salt

2. **LayerZero Endpoint**: The endpoint addresses are hardcoded in `SimpleOAppArbitrum` and `SimpleOAppBase`. Each network uses its own implementation with the correct endpoint.

3. **Owner**: The factory becomes the owner of all deployed OApp contracts. Consider if you want to transfer ownership after deployment.

## Files

- `CREATE3.sol` - CREATE3 library implementation
- `SimpleOAppArbitrum.sol` - Simple OApp for Arbitrum network
- `SimpleOAppBase.sol` - Simple OApp for Base network
- `OAppFactory.sol` - Factory using CREATE3 with automatic network detection
- `test/poc/OAppFactory.t.sol` - Test suite

## Setup Functions

### SimpleOApp Setup

After deploying a pair, you need to call `setupLayerZero()` on each deployed contract. **Anyone can call this function** as it doesn't take parameters or transfer tokens:

```solidity
// On Arbitrum - anyone can call
SimpleOAppArbitrum(pairAddress).setupLayerZero();

// On Base - anyone can call
SimpleOAppBase(pairAddress).setupLayerZero();
```

This function:
- Can only be called once (enforced by `_setupComplete` flag)
- Sets the peer to the same contract address on the other network (CREATE3 ensures same address)
- Configures the bridge config with the remote EID and remote bridge address
- **No access restrictions** - safe for anyone to call

### Factory DVN Configuration

The factory can be configured with default DVN settings that will be automatically applied to all pairs created for each network type:

```solidity
// Set default DVN config for Arbitrum network
factory.setDefaultDVNConfig(
    OAppFactory.NetworkType.ARBITRUM,
    sendLib,
    receiveLib,
    requiredDVN,
    executor,
    confirmations,    // e.g., 20
    maxMessageSize,   // e.g., 10000
    gracePeriod       // e.g., 0
);

// Or use defaults (20 confirmations, 10000 max message size, 0 grace period)
factory.setDefaultDVNConfigWithDefaults(
    OAppFactory.NetworkType.ARBITRUM,
    sendLib,
    receiveLib,
    requiredDVN,
    executor
);
```

**Important**: Once the default DVN config is set for a network type, all pairs created for that network will automatically have their DVN configured during deployment. No need to manually configure each pair!

The DVN configuration includes:
- Send and receive libraries on the LayerZero endpoint
- ULN (Universal Light Node) configuration with required DVNs
- Executor configuration for message execution

## PoC Features

### Cross-Chain Value Transfer

The SimpleOApp contracts include functions to test cross-chain communication:

- **`sendValue(uint256 value)`**: Sends a value to the pair contract on the other network via LayerZero
  - Requires setup to be complete
  - Requires sufficient ETH for LayerZero fees (use `quoteSendValue()` to get the fee)
  - Emits `ValueSent` event

- **`getValue()`**: Returns the last value received from the other network
  - Useful for verifying that messages crossed successfully

- **`_lzReceive()`**: Automatically receives and processes messages from the other network
  - Validates the source EID
  - Updates the stored value
  - Emits `ValueReceived` event

### Usage Example

```solidity
// 1. Get quote for sending a value
uint256 value = 100;
(uint256 nativeFee, ) = SimpleOAppArbitrum(pairAddress).quoteSendValue(value);

// 2. Send value (include enough ETH for fees)
SimpleOAppArbitrum(pairAddress).sendValue{value: nativeFee}(value);

// 3. Wait for LayerZero to deliver the message (usually a few minutes)

// 4. Check received value on the other network
uint256 received = SimpleOAppBase(pairAddress).getValue();
// Should equal the sent value after delivery
```

## Current Status

✅ **Completed:**
- CREATE3 library implementation
- SimpleOApp contracts for Arbitrum and Base with setup functions
- OAppFactory using CREATE3 for deterministic deployments
- LayerZero setup functions (`setupLayerZero()`)
- DVN configuration functions in Factory
- Cross-chain value transfer functions (`sendValue()`, `getValue()`)
- Basic test suite structure

⚠️ **Known Issues:**
- Tests currently fail because the hardcoded LayerZero endpoint doesn't exist in the test environment
- For testing, you'll need to either:
  1. Use a mock endpoint (like in `TestHelperOz5`)
  2. Deploy to a testnet with the correct endpoint
  3. Make the endpoint configurable

## Future Improvements

- Make LayerZero endpoint configurable or use initialization pattern
- Add proper test setup with mock endpoints
- Support for different OApp implementations
- Cross-chain verification utilities
- Scripts for deploying factories on multiple networks

