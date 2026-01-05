# Token Bridge Documentation

This document describes the LayerZero-based token bridge system for bridging tokens between PM (Prediction Market) and SM (Secondary Market) sides.

## Overview

The token bridge enables:
- Creating token pairs on both sides with deterministic addresses using CREATE2
- Bridging tokens between chains with ACK confirmation
- Timeout and retry mechanisms for failed transfers
- Holding tokens in escrow during bridging
- Unique transfer IDs to prevent duplicate transfers

## Architecture

### Contracts

1. **BridgeableToken** (`BridgeableToken.sol`)
   - ERC20 token with mint/burn functionality
   - Owned by the bridge contract
   - Can be minted and burned only by the bridge

2. **TokenBridge** (`TokenBridge.sol`)
   - Main bridge contract deployed on both PM and SM sides
   - Handles token pair creation, bridging, ACK, timeout, and retry
   - Uses LayerZero for cross-chain communication

3. **CREATE2Deployer** (`CREATE2Deployer.sol`)
   - Helper library for deploying contracts at deterministic addresses using CREATE2

### Key Features

#### Deterministic Token Addresses

Tokens are deployed using CREATE2, ensuring the same token address on both chains when:
- The same salt is used
- The bridge contract address is the same on both chains
- The token bytecode is identical

#### Bridge Flow

1. **Token Pair Creation** (PM Side Only):
   ```
   Owner -> createTokenPair(name, symbol, decimals, salt)
   - Deploys token on PM side using CREATE2
   - Sends LayerZero message to SM side
   - SM side receives message and deploys token with same address
   - SM side sends ACK back to PM side
   - PM side receives ACK and marks token pair as acknowledged
   - Bridging is only allowed after ACK is received
   ```

2. **Bridge Tokens**:
   ```
   User -> bridgeTokens(token, amount)
   
   Flow:
   - Validates token pair exists and is acknowledged
   - Transfers tokens from user to bridge (escrow)
   - Generates unique transferId
   - Sends LayerZero message to remote side
   - Remote side receives message and mints tokens to user
   - Remote side sends ACK back
   - Source side receives ACK and burns escrowed tokens
   ```

#### ACK Confirmation

- When tokens are minted on the destination side, an ACK is sent back
- The source side waits for ACK before burning escrowed tokens
- Prevents double-spending and ensures atomicity

#### Timeout and Retry

- Each bridge transfer has a timeout (default: 1 hour)
- If ACK is not received within timeout, transfer can be marked as failed
- Failed transfers can be retried (max 3 retries)
- Users can refund tokens from failed transfers

#### Unique Transfer IDs

Each transfer has a unique ID generated from:
- Chain ID
- Bridge address
- User address
- Token address
- Amount
- Nonce
- Timestamp

This prevents duplicate transfers even if LayerZero messages are duplicated.

## Usage

### Setup

1. **Deploy Bridge Contracts**:
   ```solidity
   // Deploy on PM side
   TokenBridge pmBridge = new TokenBridge(lzEndpoint, owner, true);
   
   // Deploy on SM side (must be at same address using CREATE2)
   TokenBridge smBridge = new TokenBridge(lzEndpoint, owner, false);
   ```

2. **Configure Bridge**:
   ```solidity
   // On PM side
   BridgeTypes.BridgeConfig memory config = BridgeTypes.BridgeConfig({
       remoteEid: SM_CHAIN_EID,
       remoteBridge: smBridgeAddress
   });
   pmBridge.setBridgeConfig(config);
   
   // On SM side
   BridgeTypes.BridgeConfig memory config = BridgeTypes.BridgeConfig({
       remoteEid: PM_CHAIN_EID,
       remoteBridge: pmBridgeAddress
   });
   smBridge.setBridgeConfig(config);
   ```

### Creating Token Pairs

```solidity
// On PM side (only - will revert on SM side)
bytes32 salt = keccak256("MyToken");
bridge.createTokenPair("MyToken", "MTK", 18, salt);

// This will:
// 1. Deploy token on PM side at deterministic address
// 2. Send message to SM side
// 3. SM side deploys token at same address
// 4. SM side sends ACK back
// 5. PM side receives ACK and marks as acknowledged
// 6. Bridging is now allowed for this token pair
```

### Bridging Tokens

```solidity
// Works on both PM and SM sides - automatically determines direction
IERC20(token).approve(bridgeAddress, amount);
bridge.bridgeTokens(token, amount);
```

### Handling Failed Transfers

```solidity
// Mark transfer as failed (after timeout)
bridge.markTransferFailed(transferId);

// Retry failed transfer
bridge.retryBridge(transferId);

// Or refund tokens
bridge.refundFailedTransfer(transferId);
```

## Command Types

The bridge uses the following LayerZero command types:

- `CMD_CREATE_TOKEN_PAIR (10)`: Create token pair on remote side
- `CMD_CREATE_TOKEN_PAIR_ACK (11)`: Acknowledge token pair creation
- `CMD_BRIDGE_TOKENS (12)`: Bridge tokens to remote side
- `CMD_BRIDGE_ACK (13)`: Acknowledge bridge completion
- `CMD_BRIDGE_RETRY (14)`: Retry a failed bridge transfer

## Security Considerations

1. **Escrow**: Tokens are held in escrow until ACK is received
2. **Unique IDs**: Transfer IDs prevent duplicate processing
3. **Timeout**: Failed transfers can be refunded after timeout
4. **Retry Limit**: Maximum 3 retries to prevent infinite loops
5. **Access Control**: Only owner can create token pairs, and only on PM side
6. **Validation**: Source chain and sender are validated on every message
7. **ACK Requirement**: Token pairs must be acknowledged on both sides before bridging
8. **Direction Control**: Bridge direction functions are restricted based on `isPMSide` flag

## Events

- `TokenPairCreated`: Emitted when a token pair is created
- `BridgeInitiated`: Emitted when a bridge transfer is initiated
- `BridgeCompleted`: Emitted when a bridge transfer completes
- `BridgeFailed`: Emitted when a bridge transfer fails
- `BridgeRetried`: Emitted when a bridge transfer is retried
- `TokensEscrowed`: Emitted when tokens are escrowed
- `TokensReleased`: Emitted when tokens are released from escrow

## View Functions

- `getTokenPair(address token)`: Get token pair information
- `getBridgeTransfer(bytes32 transferId)`: Get bridge transfer details
- `getEscrowedBalance(address token, address user)`: Get escrowed balance for a user

