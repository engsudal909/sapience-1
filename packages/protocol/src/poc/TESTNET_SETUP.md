# Testnet Setup Guide - Arbitrum Sepolia & Base Sepolia

This guide explains how to deploy and test the OAppFactory PoC on Arbitrum Sepolia and Base Sepolia testnets.

## Network Information

### Arbitrum Sepolia
- **Chain ID**: `421614`
- **LayerZero Endpoint**: `0x6EDCE65403992e310A62460808c4b910D972f10f`
- **LayerZero EID**: `40231`
- **RPC URL**: `https://sepolia-rollup.arbitrum.io/rpc`
- **Explorer**: `https://sepolia-explorer.arbitrum.io`

### Base Sepolia
- **Chain ID**: `84532`
- **LayerZero Endpoint**: `0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7`
- **LayerZero EID**: `40245`
- **RPC URL**: `https://sepolia.base.org`
- **Explorer**: `https://sepolia-explorer.base.org`

## Getting Test ETH

### Arbitrum Sepolia Faucets
1. **QuickNode Faucet**: https://faucet.quicknode.com/arbitrum/sepolia
2. **Alchemy Faucet**: https://www.alchemy.com/faucets/arbitrum-sepolia
3. **Chainlink Faucet**: https://faucets.chain.link/arbitrum-sepolia

### Base Sepolia Faucets
1. **Coinbase Developer Platform**: https://www.coinbase.com/developer-platform/products/faucet
2. **QuickNode Faucet**: https://faucet.quicknode.com/base/sepolia
3. **Chainlink Faucet**: https://faucets.chain.link/base-sepolia

**Note**: Some faucets may require:
- A minimum balance on Ethereum mainnet (e.g., 0.001 ETH)
- Social media verification
- Daily limits on claims

## Automatic Testnet Detection

The contracts use the correct LayerZero EIDs for mainnet:

- **Arbitrum One** (42161) → Uses EID `30110` for Arbitrum, `30184` for Base
- **Base** (8453) → Uses EID `30110` for Arbitrum, `30184` for Base

No code changes are needed - the contracts will automatically use the correct EIDs!

## Deployment Steps

### 1. Deploy Factory on Arbitrum Sepolia

```bash
# Set your private key and RPC URL
export PRIVATE_KEY=your_private_key
export ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc

# Deploy using Forge
forge script src/scripts/poc/DeployOAppFactory.s.sol:DeployOAppFactory \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv
```

Or use the DDP script for deterministic deployment:

```bash
forge script src/scripts/poc/DeployOAppFactoryWithDDP.s.sol:DeployOAppFactoryWithDDP \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv
```

### 2. Deploy Factory on Base Sepolia

```bash
export BASE_SEPOLIA_RPC=https://sepolia.base.org

forge script src/scripts/poc/DeployOAppFactory.s.sol:DeployOAppFactory \
  --rpc-url $BASE_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv
```

**Important**: For CREATE3 to work correctly, deploy the factory at the same address on both networks. Use the DDP script or ensure the same deployer address and nonce.

### 3. Configure DVN Settings

You'll need to configure the DVN (Decentralized Verifier Network) settings for LayerZero. Get the addresses from LayerZero's documentation or testnet explorer.

```solidity
// On Arbitrum Sepolia
factory.setDefaultDVNConfigWithDefaults(
    OAppFactory.NetworkType.ARBITRUM,
    sendLibAddress,      // Get from LayerZero docs
    receiveLibAddress,   // Get from LayerZero docs
    requiredDVNAddress, // Get from LayerZero docs
    executorAddress     // Get from LayerZero docs
);

// On Base Sepolia
factory.setDefaultDVNConfigWithDefaults(
    OAppFactory.NetworkType.BASE,
    sendLibAddress,
    receiveLibAddress,
    requiredDVNAddress,
    executorAddress
);
```

### 4. Create Pairs

```solidity
// On Arbitrum Sepolia
bytes32 salt = keccak256("MY_TEST_PAIR");
address pairAddress = factory.createPair(salt);

// On Base Sepolia (same salt = same address!)
address pairAddress = factory.createPair(salt);
```

### 5. Setup LayerZero

```solidity
// On Arbitrum Sepolia
SimpleOAppArbitrum(pairAddress).setupLayerZero();

// On Base Sepolia
SimpleOAppBase(pairAddress).setupLayerZero();
```

### 6. Test Cross-Chain Communication

```solidity
// On Arbitrum Sepolia - Send value
uint256 value = 12345;
uint256 fee = SimpleOAppArbitrum(pairAddress).quoteSendValue(value);
SimpleOAppArbitrum(pairAddress).sendValue{value: fee}(value);

// Wait for LayerZero to deliver (usually a few minutes)

// On Base Sepolia - Check received value
uint256 received = SimpleOAppBase(pairAddress).getValue();
// Should equal 12345 after delivery
```

## Finding LayerZero Testnet Addresses

To find the correct DVN, SendLib, ReceiveLib, and Executor addresses for testnet:

1. **LayerZero Documentation**: Check https://docs.layerzero.network/
2. **LayerZero Explorer**: Check testnet explorers for deployed contracts
3. **LayerZero Discord**: Ask in the developer channel
4. **Testnet Contracts**: Look for LayerZero contracts on the testnet explorers

Common addresses (verify these are correct for testnet):
- SendLib: Usually deployed by LayerZero team
- ReceiveLib: Usually deployed by LayerZero team
- DVN: Decentralized Verifier Network address
- Executor: Executor contract address

## Troubleshooting

### Issue: "InsufficientFee" error
**Solution**: Make sure you have enough test ETH. The fee can be higher on testnets.

### Issue: Messages not being delivered
**Solution**: 
1. Verify DVN configuration is correct
2. Check that `setupLayerZero()` was called on both contracts
3. Wait a few minutes - testnet delivery can be slower
4. Check LayerZero explorer for message status

### Issue: Factory addresses don't match
**Solution**: Use the DDP script (`DeployOAppFactoryWithDDP.s.sol`) to ensure deterministic deployment.

### Issue: "UnsupportedChainId" error
**Solution**: Make sure you're deploying on Arbitrum Sepolia (421614) or Base Sepolia (84532).

## Testing Checklist

- [ ] Deployed factory on Arbitrum Sepolia
- [ ] Deployed factory on Base Sepolia (same address)
- [ ] Configured DVN settings on both networks
- [ ] Created pair on Arbitrum Sepolia
- [ ] Created pair on Base Sepolia (same address)
- [ ] Called `setupLayerZero()` on both contracts
- [ ] Sent value from Arbitrum Sepolia to Base Sepolia
- [ ] Verified value received on Base Sepolia
- [ ] Sent value back from Base Sepolia to Arbitrum Sepolia
- [ ] Verified value received on Arbitrum Sepolia

## Additional Resources

- LayerZero Docs: https://docs.layerzero.network/
- Arbitrum Sepolia Explorer: https://sepolia-explorer.arbitrum.io
- Base Sepolia Explorer: https://sepolia-explorer.base.org
- LayerZero Discord: Join for support and updates

