# lzRead Mainnet Smoke Test - Troubleshooting Guide

## Current Blocker: Executor Fee Calculation Error

### Symptom
When calling `quoteResolution()` or `requestResolution()`, the transaction reverts with a `.U` (unexpected) error from LayerZero's executor.

### Root Cause
The executor at `0x31CAe3B7fB82d847621859fb1585353c5720660D` (default Arbitrum executor) may not support lzRead operations, or lzRead requires different configuration than regular messaging.

## Solutions to Try

### Solution 1: Fixed Configuration (Address(0) Executor) ⭐ RECOMMENDED
Set executor to `address(0)` to use LayerZero's default executor infrastructure:

```bash
# After deploying and configuring resolver, use fixed config:
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfigFixed.s.sol \
  --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY

# Then test fee quoting:
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \
  --rpc-url $ARB_RPC
```

This script sets executor to `address(0)` which tells LayerZero to use default executor.
The executor for lzRead is actually specified in options via `addExecutorLzReadOption`.

### Solution 2: Minimal Configuration (No Executor Config)
Skip executor configuration entirely - only set ULN (DVN) config:

```bash
# After deploying and configuring resolver, use minimal config:
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_setLzReadConfigMinimal.s.sol \
  --rpc-url $ARB_RPC --broadcast --private-key $ARB_PRIVATE_KEY

# Then test fee quoting:
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \
  --rpc-url $ARB_RPC
```

This script only sets ULN (DVN) configuration and doesn't set executor config at all.

### Solution 3: Test on Testnet First
Test on Arbitrum Sepolia and Polygon Amoy where lzRead may be pre-configured:

1. Use testnet versions of the scripts (see `Sepolia-Amoy_*.s.sol`)
2. Verify lzRead works on testnet
3. Compare testnet vs mainnet configuration differences

### Solution 4: Check LayerZero Documentation
- Review LayerZero V2 docs for lzRead executor requirements
- Check if there's a specific lzRead executor address
- Verify if lzRead uses different configuration than regular messaging

### Solution 5: Contact LayerZero Support
If the above don't work:
- Reach out to LayerZero support with details about the error
- Ask about lzRead executor configuration on Arbitrum One mainnet
- Request guidance on proper lzRead setup

## Diagnostic Tools

### Test Fee Quoting
Use the diagnostic script to test fee calculation without sending transactions:

```bash
export RESOLVER=0x617AdeA1dC03444481d73FdCB15644A191F74944
forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_testFeeQuote.s.sol \
  --rpc-url $ARB_RPC
```

This will:
- Attempt to quote fees for both YES and NO conditions
- Provide detailed error messages if quoting fails
- Suggest next steps based on the error

### Verify Configuration
Check current LayerZero configuration:

```bash
# Use cast or a custom script to query:
# - Executor config for read channel
# - ULN config for read channel
# - Send library configuration
```

## Configuration Options

### Fixed Configuration (Recommended) ⭐
- Sets executor to `address(0)` to use LayerZero defaults
- Sets ULN config with 0 required DVNs (appropriate for read operations)
- Script: `Arb1-Polygon_setLzReadConfigFixed.s.sol`
- **This is the recommended approach** - executor is specified in options per-request

### Minimal Configuration (Alternative)
- Only sets ULN config, no executor config at all
- Executor determined from options when calling `_lzSend`
- Script: `Arb1-Polygon_setLzReadConfigMinimal.s.sol`

### Full Configuration (May Fail)
- Sets both executor and ULN config explicitly
- Uses executor: `0x31CAe3B7fB82d847621859fb1585353c5720660D`
- Script: `Arb1-Polygon_setLzReadConfig.s.sol`
- **May fail** if executor doesn't support lzRead fee calculation

## Known Issues

1. **Executor Fee Calculation Fails**: The default executor may not support lzRead
   - **Workaround**: Try minimal config or different executor
   - **Status**: Blocking mainnet deployment

2. **Read Channel EID**: Must point to destination chain (Polygon 30109), not source
   - **Status**: ✅ Resolved - corrected in scripts

3. **Executor/DVN Configuration**: Required for lzRead on mainnet
   - **Status**: ⚠️ Partially resolved - config succeeds but fee calculation fails

## Next Steps Once Unblocked

1. **Complete End-to-End Test**:
   - Send `requestResolution()` for both YES and NO conditions
   - Wait for LayerZero callbacks (30-120 seconds)
   - Verify resolver state matches expected outcomes

2. **Add Monitoring**:
   - Log lzRead callback events
   - Track request → response latency
   - Monitor for failed requests

3. **Add Retry Logic**:
   - Handle failed lzRead requests
   - Implement retry mechanism for transient failures

## Environment Variables Reference

### Required
- `ARB_PRIVATE_KEY`: Private key for deployment
- `ARB_RPC`: Arbitrum One RPC URL
- `ARB_LZ_ENDPOINT`: LayerZero endpoint on Arbitrum (0x1a44076050125825900e736c501f859c50fE728c)
- `ARB_OWNER`: Owner address for resolver
- `RESOLVER`: Deployed resolver address (after step 1)

### Optional (with defaults)
- `READ_CHANNEL_EID`: 30109 (Polygon)
- `POLYGON_EID`: 30109
- `POLYGON_CTF`: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
- `CONDITION_YES`: Known YES condition ID
- `CONDITION_NO`: Known NO condition ID
- `ARB_EXECUTOR`: Executor address (default: 0x31CAe3B7fB82d847621859fb1585353c5720660D)
- `ARB_DVN`: DVN address (default: 0x9c8D8A224545c15024cB50C7c02cf3EA9AA1bF36)
- `REQUIRED_DVN_COUNT`: Number of required DVNs (default: 1, or 0 for minimal)

## Script Execution Order

1. **Deploy**: `Arb1-Polygon_deployResolver.s.sol`
2. **Configure**: `Arb1-Polygon_configureResolver.s.sol` (set peer, enable read channel)
3. **Set LZ Config**: Choose one:
   - `Arb1-Polygon_setLzReadConfig.s.sol` (full config)
   - `Arb1-Polygon_setLzReadConfigMinimal.s.sol` (minimal config)
4. **Test Fees**: `Arb1-Polygon_testFeeQuote.s.sol` (diagnostic)
5. **Request Resolution**: `Arb1-Polygon_requestResolution.s.sol`
6. **Verify**: `Arb1-Polygon_verifyResolverState.s.sol`

Or use the all-in-one script:
```bash
bash src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_all.sh
```

