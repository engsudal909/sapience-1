# Prediction Market LayerZero Resolvers

This directory contains a LayerZero-based resolver system for the Prediction Market, designed for cross-chain prediction market resolution.

## Architecture Overview

The system consists of two contracts with clear separation of concerns:

1. **PredictionMarketLZResolver** - Deployed on the prediction market network (receives only)
2. **PredictionMarketLZResolverUmaSide** - Deployed on the UMA network (handles submission and sends results)

## Key Features

### Prediction Market Side
- **Only receives** LayerZero messages from UMA side
- **No assertion submission** - all handled on UMA side
- **Simple state management** - only tracks market resolutions
- **No bond management** - bonds handled on UMA side

### UMA Side
- **Handles all assertion submissions** directly to UMA
- **Manages bond tokens** for all submissions
- **Sends results** back to prediction market side via LayerZero
- **Simple message flow** - only sends resolution/dispute messages

## Contracts Overview

### PredictionMarketLZResolver

**Location**: `PredictionMarketLZResolver.sol`

**Purpose**: Receives and tracks market resolutions from UMA side.

**Key Features**:
- Implements `IPredictionMarketResolver` interface
- Only receives LayerZero messages (no sending)
- Simple market state tracking (settled/resolvedToYes)
- No bond management or assertion submission

**Key Functions**:
- `marketResolvedCallback()` - Handle market resolution from UMA
- `marketDisputedCallback()` - Handle market dispute from UMA
- `validatePredictionMarkets()` - Validate prediction market data
- `getPredictionResolution()` - Get resolution status

### PredictionMarketLZResolverUmaSide

**Location**: `PredictionMarketLZResolverUmaSide.sol`

**Purpose**: Handles all UMA interactions and sends results to prediction market side.

**Key Features**:
- Implements UMA's `OptimisticOracleV3CallbackRecipientInterface`
- Manages bond tokens for all submissions
- Handles assertion submissions directly to UMA
- Sends resolution/dispute messages via LayerZero

**Key Functions**:
- `submitAssertion()` - Submit assertion to UMA (public function)
- `depositBond()` / `withdrawBond()` - Bond management
- `assertionResolvedCallback()` - UMA callback for resolved assertions
- `assertionDisputedCallback()` - UMA callback for disputed assertions

## Setup and Configuration

### 1. Deploy Contracts

#### Prediction Market Side
```solidity
// Deploy PredictionMarketLZResolver
PredictionMarketLZResolver.Settings memory config = PredictionMarketLZResolver.Settings({
    maxPredictionMarkets: 100
});

PredictionMarketLZResolver resolver = new PredictionMarketLZResolver(
    LAYERZERO_ENDPOINT,
    OWNER,
    config
);
```

#### UMA Side
```solidity
// Deploy PredictionMarketLZResolverUmaSide
PredictionMarketLZResolverUmaSide.Settings memory umaConfig = PredictionMarketLZResolverUmaSide.Settings({
    bondCurrency: USDC_ADDRESS,
    bondAmount: 1000e6, // 1000 USDC
    assertionLiveness: 3600 // 1 hour
});

PredictionMarketLZResolverUmaSide umaResolver = new PredictionMarketLZResolverUmaSide(
    LAYERZERO_ENDPOINT,
    OWNER,
    UMA_OPTIMISTIC_ORACLE_V3_ADDRESS,
    umaConfig
);
```

### 2. Configure LayerZero

#### Set Bridge Configuration
```solidity
// On prediction market side
BridgeTypes.BridgeConfig memory bridgeConfig = BridgeTypes.BridgeConfig({
    remoteEid: UMA_CHAIN_EID,
    remoteBridge: UMA_SIDE_RESOLVER_ADDRESS
});
resolver.setBridgeConfig(bridgeConfig);

// On UMA side
BridgeTypes.BridgeConfig memory bridgeConfig = BridgeTypes.BridgeConfig({
    remoteEid: PREDICTION_MARKET_CHAIN_EID,
    remoteBridge: PREDICTION_MARKET_SIDE_RESOLVER_ADDRESS
});
umaResolver.setBridgeConfig(bridgeConfig);
```

### 3. Fund UMA Side with Bonds

```solidity
// Deposit bond tokens to UMA side resolver
IERC20(USDC_ADDRESS).approve(umaResolver, 10000e6); // 10,000 USDC
umaResolver.depositBond(USDC_ADDRESS, 10000e6);
```

## Usage Flow

### 1. Submit Assertion (UMA Side)

```solidity
// On UMA side - submit assertion directly
bytes memory claim = "Bitcoin will reach $100,000 by end of 2024";
uint256 endTime = 1735689600; // Unix timestamp
bool resolvedToYes = true;

umaResolver.submitAssertion(claim, endTime, resolvedToYes);
```

### 2. Process Resolution (Automatic)

The system automatically handles:
1. UMA processes the assertion
2. UMA calls back on resolution/dispute
3. UMA side sends result to prediction market side via LayerZero
4. Prediction market side updates market state

### 3. Check Resolution (Prediction Market Side)

```solidity
// On prediction market side - check resolution
PredictedOutcome[] memory outcomes = [
    PredictedOutcome({
        marketId: marketId,
        prediction: true
    })
];

bytes memory encodedOutcomes = resolver.encodePredictionOutcomes(outcomes);
(bool isResolved, IPredictionMarketResolver.Error error, bool parlaySuccess) = 
    resolver.getPredictionResolution(encodedOutcomes);
```

## Message Types

The system uses 2 LayerZero message types:

- `CMD_FROM_UMA_MARKET_RESOLVED` (8) - Market resolved callback
- `CMD_FROM_UMA_MARKET_DISPUTED` (9) - Market disputed callback

## Key Benefits

### 1. **Clear Separation of Concerns**
- Prediction market side: Only receives and tracks
- UMA side: Only submits and sends results

### 2. **Simple Deployment**
- No complex cross-chain bond management
- No approved asserters management on prediction market side
- Single source of truth for bond management

### 3. **Easy Maintenance**
- Fewer moving parts
- Clear message flow
- Simple state management

### 4. **Better Security**
- Bond management centralized on UMA side
- No cross-chain bond transfers
- Simple access control

## Bond Management

### UMA Side Bond Management
```solidity
// Deposit bonds
umaResolver.depositBond(USDC_ADDRESS, amount);

// Withdraw bonds
umaResolver.withdrawBond(USDC_ADDRESS, amount);

// Check balance
uint256 balance = umaResolver.getBondBalance(USDC_ADDRESS);
```

### Bond Flow
1. Users deposit bonds to UMA side resolver
2. UMA side uses bonds for assertion submissions
3. Bonds are returned to UMA side after resolution
4. Users can withdraw bonds from UMA side

## Error Handling

### Prediction Market Side
- `OnlyRemoteResolverCanCall()` - Unauthorized callback execution
- `InvalidMarketId()` - Invalid market reference

### UMA Side
- `OnlyOptimisticOracleV3CanCall()` - Unauthorized UMA callback
- `MarketNotEnded()` - Premature assertion submission
- `AssertionAlreadySubmitted()` - Duplicate submission
- `NotEnoughBondAmount()` - Insufficient bond tokens

## Events

### Prediction Market Side
- `MarketResolved` - Market resolved
- `MarketDisputed` - Market disputed

### UMA Side
- `MarketSubmittedToUMA` - Assertion submitted to UMA
- `MarketResolvedFromUMA` - Market resolved from UMA
- `MarketDisputedFromUMA` - Market disputed from UMA


## Testing

### Test Flow
1. Deploy both contracts on test networks
2. Configure LayerZero endpoints
3. Fund UMA side with test bonds
4. Submit test assertions on UMA side
5. Verify cross-chain communication
6. Test resolution and dispute flows

### Test Commands
```bash
# Deploy contracts
npx hardhat run scripts/deploy-resolvers.js --network testnet

# Configure LayerZero
npx hardhat run scripts/configure-resolvers.js --network testnet

# Test assertions
npx hardhat run scripts/test-assertions.js --network testnet
```

## Dependencies

- LayerZero OApp contracts
- UMA Optimistic Oracle V3
- OpenZeppelin contracts (ERC20, ReentrancyGuard)
- Custom bridge utilities (Encoder, BridgeTypes, ETHManagement)
