# lzRead Mainnet Smoke Test - Deployment Scripts

This directory contains scripts for deploying and testing `PredictionMarketLZConditionalTokensResolver` on Arbitrum One, configured to use LayerZero lzRead to query payout data from Polygon ConditionalTokens.

## Overview

The resolver uses LayerZero's lzRead feature to make cross-chain view calls to Polygon's ConditionalTokens contract, enabling resolution of prediction markets based on Polymarket conditions.

## Current Status

✅ **Complete**:
- Deployment scripts created and tested
- Resolver deployed at `0x617AdeA1dC03444481d73FdCB15644A191F74944` on Arbitrum One
- Peer configuration and read channel enabled
- LayerZero configuration scripts created with multiple approaches

✅ **Solution Available**:
- **NEW**: Recommended script (`Arb1-Polygon_setLzReadConfigWithDvn.s.sol`) uses lzRead-specific DVN addresses
- **Key Fix**: lzRead requires lzRead-specific DVN addresses, not regular messaging DVNs
- Fixed configuration script can optionally use lzRead DVN via `ARB_LZREAD_DVN` env var
- Minimal configuration script can optionally use lzRead DVN via `ARB_LZREAD_DVN` env var
- See [RESEARCH_FINDINGS.md](./RESEARCH_FINDINGS.md) for detailed findings

## Scripts

### Core Deployment Scripts

1. **`Arb1-Polygon_deployResolver.s.sol`**
   - Deploys `PredictionMarketLZConditionalTokensResolver` on Arbitrum One
   - Sets initial configuration (read channel EID, target EID, ConditionalTokens address)

2. **`Arb1-Polygon_configureResolver.s.sol`**
   - Sets peer for read channel
   - Enables read channel

3. **`Arb1-Polygon_setLzReadConfigWithDvn.s.sol`** ⭐⭐ (NEW - Recommended)
   - Sets executor to `address(0)` to use LayerZero defaults
   - Configures lzRead-specific DVN (LayerZero Labs by default)
   - **This is the NEW recommended approach** based on research findings
   - Uses lzRead-specific DVN addresses (not regular messaging DVNs)

4. **`Arb1-Polygon_setLzReadConfigFixed.s.sol`** (Alternative)
   - Sets executor to `address(0)` to use LayerZero defaults
   - Can optionally configure lzRead DVN via `ARB_LZREAD_DVN` env var
   - Defaults to 0 required DVNs (LayerZero defaults)

5. **`Arb1-Polygon_setLzReadConfigMinimal.s.sol`** (Alternative)
   - Minimal configuration - only sets ULN (DVN) config
   - Can optionally configure lzRead DVN via `ARB_LZREAD_DVN` env var
   - No executor configuration at all
   - Executor determined from options per-request

6. **`Arb1-Polygon_setLzReadConfig.s.sol`** (Full Config)
   - Configures LayerZero executor and DVN for read channel
   - Uses lzRead-specific DVN by default (LayerZero Labs)
   - Sets explicit executor address

6. **`Arb1-Polygon_requestResolution.s.sol`**
   - Sends `requestResolution()` for known conditionIds (YES and NO)
   - Quotes fees and sends lzRead requests

7. **`Arb1-Polygon_verifyResolverState.s.sol`**
   - Verifies resolver cached outcomes
   - Checks if conditions are settled correctly

### Diagnostic Scripts

8. **`Arb1-Polygon_testFeeQuote.s.sol`**
   - Tests fee quoting without sending transactions
   - Provides detailed error messages
   - Use this to diagnose executor configuration issues

### Orchestration

9. **`Arb1-Polygon_all.sh`**
   - Runs all scripts in sequence
   - Extracts deployed addresses from broadcast JSON
   - Polls for resolution completion

## Quick Start

### 1. Set Environment Variables

Copy `ENV_EXAMPLE` to `.env.deployments` and fill in values:

```bash
cp ENV_EXAMPLE .env.deployments
# Edit .env.deployments with your values
```

Required variables:
- `ARB_PRIVATE_KEY`: Private key for deployment
- `ARB_RPC`: Arbitrum One RPC URL
- `ARB_LZ_ENDPOINT`: `0x1a44076050125825900e736c501f859c50fE728c`
- `ARB_OWNER`: Owner address for resolver

### 2. Deploy and Configure

**Option A: All-in-one script**
```bash
bash src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_all.sh
```

**Option B: Step-by-step**
```bash
# 1. Deploy resolver
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_deployResolver.s.sol \
  --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY

# 2. Set RESOLVER env var (extract from broadcast JSON or set manually)
export RESOLVER=0x617AdeA1dC03444481d73FdCB15644A191F74944

# 3. Configure resolver (peer, read channel)
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_configureResolver.s.sol \
  --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY

# 4. Configure LayerZero (use new recommended config with lzRead DVN)
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfigWithDvn.s.sol \
  --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY

# 5. Test fee quoting
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \
  --rpc-url $ARB_RPC

# 6. Request resolution (if fee quoting works)
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_requestResolution.s.sol \
  --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY

# 7. Verify (after ~30-120 seconds)
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_verifyResolverState.s.sol \
  --rpc-url $ARB_RPC
```

## Configuration Details

### Read Channel EID
- **Important**: For lzRead, `readChannelEid` should be the **destination chain** (Polygon 30109), not the source (Arbitrum 30110)
- This is different from regular messaging where you specify the destination

### LayerZero Configuration Options

**Recommended Configuration** (`Arb1-Polygon_setLzReadConfigWithDvn.s.sol`) ⭐⭐ **NEW - Recommended**:
- Sets executor to `address(0)` to use LayerZero defaults
- Configures lzRead-specific DVN (LayerZero Labs by default: `0x1308151a7ebac14f435d3ad5ff95c34160d539a5`)
- **Key Fix**: Uses lzRead-specific DVN addresses, not regular messaging DVNs
- Based on research findings that lzRead requires lzRead-specific DVN configuration
- Executor is specified in options per-request via `addExecutorLzReadOption`

**Fixed Configuration** (`Arb1-Polygon_setLzReadConfigFixed.s.sol`):
- Sets executor to `address(0)` to use LayerZero defaults
- Can optionally configure lzRead DVN via `ARB_LZREAD_DVN` env var
- Defaults to 0 required DVNs (LayerZero defaults)

**Minimal Configuration** (`Arb1-Polygon_setLzReadConfigMinimal.s.sol`):
- Only sets ULN configuration
- Can optionally configure lzRead DVN via `ARB_LZREAD_DVN` env var
- No executor configuration at all
- Executor determined from options when calling `_lzSend`

**Full Configuration** (`Arb1-Polygon_setLzReadConfig.s.sol`):
- Sets explicit executor address
- Uses lzRead-specific DVN by default (LayerZero Labs)
- Sets ULN (DVN) configuration

## Known ConditionIds

The scripts use real Polymarket conditions that have already resolved:

- **YES condition**: `0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc`
  - Resolved to YES: `payoutNumerators = [0, 1]`

- **NO condition**: `0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e`
  - Resolved to NO: `payoutNumerators = [1, 0]`

## Troubleshooting

If you encounter executor fee calculation errors:

1. **Try minimal configuration** (no explicit executor)
2. **Test fee quoting** with the diagnostic script
3. **Check TROUBLESHOOTING.md** for detailed guidance
4. **Test on testnet first** (testnet scripts coming soon)

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for comprehensive troubleshooting guide.

## Architecture

The resolver sends 3 separate lzRead requests per condition:
1. `payoutDenominator(conditionId)` - Total payout denominator
2. `payoutNumerators(conditionId, 0)` - NO payout numerator
3. `payoutNumerators(conditionId, 1)` - YES payout numerator

Responses are correlated via `guid` and cached when all 3 responses are received. The resolver then determines if the condition resolved to YES or NO based on the payout numerators.

## Next Steps (Once Unblocked)

1. Complete end-to-end test with both YES and NO conditions
2. Add monitoring/logging for lzRead callback events
3. Implement retry logic for failed requests
4. Create testnet versions of scripts
5. Document LayerZero lzRead best practices

## References

- [LayerZero V2 Documentation](https://docs.layerzero.network/v2)
- [lzRead Documentation](https://docs.layerzero.network/v2/developers/evm/lzread)
- Resolver contract: `packages/protocol/src/predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol`
- Fork test: `packages/protocol/test/predictionMarket/PredictionMarketLZConditionalTokensResolver.t.sol`

