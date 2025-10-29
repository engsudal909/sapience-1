# Prediction Market LayerZero Resolvers

This directory contains LayerZero-based resolver contracts for the Prediction Market system, designed to work across different networks where UMA may not be available.

## Architecture

The system consists of two main contracts:

1. **PredictionMarketLayerZeroResolver** - Deployed on the prediction market network
2. **PredictionMarketUmaLayerZeroResolver** - Deployed on the UMA network

## Contracts Overview

### PredictionMarketLayerZeroResolver

**Location**: `PredictionMarketLayerZeroResolver.sol`

**Purpose**: Handles prediction market logic and communicates with UMA via LayerZero.

**Key Features**:
- Implements `IPredictionMarketResolver` interface
- Manages wrapped markets and their states
- Handles assertion submissions from approved asserters
- Receives resolution updates from UMA side via LayerZero
- Manages bond tokens and validation

**Key Functions**:
- `submitAssertion()` - Submit a new assertion to UMA
- `assertionResolvedCallback()` - Handle resolution from UMA
- `assertionDisputedCallback()` - Handle dispute notifications from UMA
- `validatePredictionMarkets()` - Validate prediction market data
- `getPredictionResolution()` - Get resolution status

### PredictionMarketUmaLayerZeroResolver

**Location**: `PredictionMarketUmaLayerZeroResolver.sol`

**Purpose**: Handles UMA interactions and forwards results back to the prediction market side.

**Key Features**:
- Implements UMA's `OptimisticOracleV3CallbackRecipientInterface`
- Manages UMA assertion submissions
- Handles UMA callbacks (resolved/disputed)
- Forwards results back to prediction market side via LayerZero
- Manages bond token transfers

**Key Functions**:
- `assertionResolvedCallback()` - UMA callback for resolved assertions
- `assertionDisputedCallback()` - UMA callback for disputed assertions
- `_handleSubmitAssertion()` - Process assertion submissions from prediction market side

## Setup and Configuration

### 1. Deploy Contracts

#### Prediction Market Side
```solidity
// Deploy PredictionMarketLayerZeroResolver
PredictionMarketLayerZeroResolver.Settings memory config = PredictionMarketLayerZeroResolver.Settings({
    maxPredictionMarkets: 100,
    bondCurrency: USDC_ADDRESS,
    bondAmount: 1000e6, // 1000 USDC
    assertionLiveness: 3600, // 1 hour
    remoteResolver: UMA_SIDE_RESOLVER_ADDRESS
});

address[] memory approvedAsserters = [ASSERTER1, ASSERTER2];
PredictionMarketLayerZeroResolver resolver = new PredictionMarketLayerZeroResolver(
    LAYERZERO_ENDPOINT,
    OWNER,
    config,
    approvedAsserters
);
```

#### UMA Side
```solidity
// Deploy PredictionMarketUmaLayerZeroResolver
PredictionMarketUmaLayerZeroResolver umaResolver = new PredictionMarketUmaLayerZeroResolver(
    LAYERZERO_ENDPOINT,
    OWNER,
    UMA_OPTIMISTIC_ORACLE_V3_ADDRESS
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

### 3. Configure UMA Integration

```solidity
// Set UMA Optimistic Oracle V3 address
umaResolver.setOptimisticOracleV3(UMA_OPTIMISTIC_ORACLE_V3_ADDRESS);
```

## Usage Flow

### 1. Submit Assertion

```solidity
// On prediction market side
bytes memory claim = "Bitcoin will reach $100,000 by end of 2024";
uint256 endTime = 1735689600; // Unix timestamp
bool resolvedToYes = true;

resolver.submitAssertion(claim, endTime, resolvedToYes);
```

### 2. Process Resolution

The system automatically handles:
1. Assertion submission to UMA via LayerZero
2. UMA processing and potential disputes
3. Resolution callback back to prediction market side
4. Market state updates

### 3. Check Resolution

```solidity
// Check if markets are resolved
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

The system uses the following LayerZero message types:

- `CMD_TO_UMA_SUBMIT_ASSERTION` (8) - Submit assertion to UMA
- `CMD_FROM_UMA_ASSERTION_RESOLVED` (9) - Assertion resolved callback
- `CMD_FROM_UMA_ASSERTION_DISPUTED` (10) - Assertion disputed callback

## Security Considerations

1. **Access Control**: Only approved asserters can submit assertions
2. **Bond Management**: Bond tokens are properly managed and validated
3. **Reentrancy Protection**: All external calls are protected
4. **LayerZero Security**: Messages are validated for source chain and sender
5. **UMA Integration**: Proper callback handling and state management

## Error Handling

The contracts include comprehensive error handling:

- `OnlyApprovedAssertersCanCall()` - Unauthorized assertion submission
- `OnlyRemoteResolverCanCall()` - Unauthorized callback execution
- `MarketNotEnded()` - Premature assertion submission
- `MarketAlreadySettled()` - Duplicate settlement attempt
- `InvalidMarketId()` - Invalid market reference
- `NotEnoughBondAmount()` - Insufficient bond tokens

## Events

Key events for monitoring:

- `MarketWrapped` - New market created
- `AssertionSubmitted` - Assertion submitted to UMA
- `AssertionResolved` - Market resolved
- `AssertionDisputed` - Market disputed

## Testing

To test the system:

1. Deploy both contracts on test networks
2. Configure LayerZero endpoints
3. Submit test assertions
4. Verify cross-chain communication
5. Test resolution and dispute flows

## Dependencies

- LayerZero OApp contracts
- UMA Optimistic Oracle V3
- OpenZeppelin contracts (ERC20, ReentrancyGuard)
- Custom bridge utilities (Encoder, BridgeTypes, ETHManagement)
