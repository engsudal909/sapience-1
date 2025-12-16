# lzRead Mainnet Research Findings

## Contract Verification
- **Resolver Address**: `0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6` on Arbitrum One (latest)
- **Old Resolver**: `0x617AdeA1dC03444481d73FdCB15644A191F74944` 
- **Verified on Arbiscan**: ✅ Yes
- **Configuration**: Correct (readChannelEid: 30109, targetEid: 30109)

## Current Error - DECODED ✅
- **Error Selector**: `0x052e5515`
- **Actual Error**: `Executor_UnsupportedOptionType(uint8)` with value `5`
- **Value 5 means**: `OPTION_TYPE_LZREAD` (from ExecutorOptions.sol)
- **Root Cause**: Quoting goes through SendUln302 which rejects LZREAD options
- **Why SendUln302**: ReadLib1002.isSupportedEid() returns false, so endpoint uses default send lib

## Configuration Attempts

### ✅ Successfully Configured:
1. **Resolver Deployment**: Deployed and configured correctly
2. **Read Channel EID**: Fixed to 30109 (Polygon) - was incorrectly 30110
3. **Peer Configuration**: Set correctly (resolver to itself)
4. **Read Channel**: Enabled
5. **Send Library**: Set to SendUln302 (0x975bcD720be66659e3EB3C0e4F1866a3020E493A)
6. **Receive Library**: Set to ReceiveUln302 (0x7B9E184e07a6EE1aC23eAe0fe8D6Be2f663f05e6)
7. **Executor Config**: Multiple attempts:
   - Address(0) executor (default)
   - Explicit executor (0x31CAe3B7fB82d847621859fb1585353c5720660D)
   - Alternative executor (0xe149187a987F129FD3d397ED04a60b0b89D1669f) - **Not a contract**
8. **DVN Config**: Set with various configurations (0 DVNs, 1 DVN) - **BUT used regular DVN addresses, not lzRead-specific DVNs**

### ❌ Still Failing:
- Fee quoting fails with error code 5 regardless of executor configuration
- Executor config shows defaults even after `setConfig` calls

## Key Findings

### 1. Read Library (ReadLib1002)
- **Address**: `0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf`
- **Status**: ⚠️ Direct `isSupportedEid(30109)` check returns `false`, BUT lzRead DVNs using ReadLib1002 DO support Polygon
- **Test Result**: `isSupportedEid(30109)` returns `false` when queried directly
- **Implication**: Need to configure lzRead-specific DVNs, not rely on direct ReadLib1002 support check
- **Available lzRead DVNs for Arbitrum → Polygon**:
  - **AltLayer**: `0x8ede21203e062d7d1eaec11c4c72ad04cdc15658`
  - **BCW Group**: `0x05ce650134d943c5e336dc7990e84fb4e69fdf29`
  - **Horizen**: `0x5cff49d69d79d677dd3e5b38e048a0dcb6d86aaf`
  - **LayerZero Labs**: `0x1308151a7ebac14f435d3ad5ff95c34160d539a5`
  - **Nethermind**: `0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd`
  - **Nocturnal Labs**: `0xfdd2e77a6addc1e18862f43297500d2ebfbd94ac`

### 2. Send Library (SendUln302)
- **Address**: `0x975bcD720be66659e3EB3C0e4F1866a3020E493A`
- **Status**: ✅ Currently configured
- **Issue**: Returns error code 5 when quoting lzRead messages
- **Implication**: SendUln302 may not fully support lzRead fee quoting, or lzRead from Arbitrum to Polygon is not supported

### 3. Executor Addresses
- **Original**: `0x31CAe3B7fB82d847621859fb1585353c5720660D` ✅ (exists, has code)
- **Alternative from research**: `0xe149187a987F129FD3d397ED04a60b0b89D1669f` ❌ (not a contract on Arbitrum)
- **Issue**: Even with correct executor, error persists

### 4. Error Code 5 Analysis
- **Consistent**: Error code 5 appears regardless of executor configuration
- **Source**: Likely from SendUln302 when trying to quote lzRead
- **Possible Meanings**:
  - **Most Likely**: Missing or incorrect lzRead DVN configuration (using regular DVN instead of lzRead DVN)
  - Executor not configured for lzRead
  - lzRead not supported for this chain pair
  - Missing read library configuration
  - Invalid executor option format

### 5. lzRead DVN Discovery (NEW)
- **Source**: LayerZero official read-addresses.json configuration
- **Finding**: Multiple lzRead DVN providers support Arbitrum → Polygon
- **Key Insight**: lzRead requires **lzRead-specific DVN addresses**, not regular messaging DVN addresses
- **All lzRead DVNs use ReadLib1002**: `0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf`
- **Available Providers** (all support Polygon):
  1. **LayerZero Labs**: `0x1308151a7ebac14f435d3ad5ff95c34160d539a5` (recommended)
  2. **Nethermind**: `0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd`
  3. **Horizen**: `0x5cff49d69d79d677dd3e5b38e048a0dcb6d86aaf`
  4. **BCW Group**: `0x05ce650134d943c5e336dc7990e84fb4e69fdf29`
  5. **AltLayer**: `0x8ede21203e062d7d1eaec11c4c72ad04cdc15658`
  6. **Nocturnal Labs**: `0xfdd2e77a6addc1e18862f43297500d2ebfbd94ac`
- **Previous Issue**: Configuration scripts were using regular DVN address (`0x9c8D8A224545c15024cB50C7c02cf3EA9AA1bF36`) instead of lzRead DVN addresses

## Research Conclusions

### Likely Root Causes:
1. **Missing lzRead DVN Configuration**: Previous attempts used regular DVN addresses instead of lzRead-specific DVN addresses. lzRead requires DVNs that specifically support lzRead operations (not just regular messaging DVNs).
2. **Wrong DVN Type**: The DVN address used (`0x9c8D8A224545c15024cB50C7c02cf3EA9AA1bF36`) appears to be a regular messaging DVN, not an lzRead DVN. Need to use one of the lzRead DVN addresses listed above.
3. **Configuration Gap**: lzRead requires specific DVN configuration - must use DVNs that support lzRead operations for the target chain pair.

### What We Know Works:
- ✅ Regular LayerZero messaging (send/receive) works fine
- ✅ Resolver contract is correctly deployed and configured
- ✅ All basic LayerZero setup is correct
- ✅ Read channel EID is correct (30109 = Polygon)

### What Doesn't Work:
- ❌ lzRead fee quoting fails with error code 5
- ❌ Using regular DVN addresses instead of lzRead-specific DVNs
- ❌ Executor configuration doesn't seem to affect the error (likely because DVN config is the issue)

## Recommendations for LayerZero Support

### Questions to Ask (if lzRead DVN config doesn't resolve issue):
1. **What is error code 5 (selector 0x052e5515)?**
   - Consistent error when quoting lzRead fees
   - Occurs even with lzRead DVN configuration

2. **What is the correct configuration for lzRead Arbitrum → Polygon?**
   - Should we use SendUln302 or ReadLib1002?
   - Does executor need to be configured on source or destination chain?
   - Are there any special requirements for this chain pair?

3. **Is there a different read library for Polygon?**
   - ReadLib1002 on Arbitrum shows `isSupportedEid(30109)` as false
   - But lzRead DVNs using ReadLib1002 claim to support Polygon
   - Is there a Polygon-specific read library we should use?

### Information to Provide:
- **Contract**: `0x617AdeA1dC03444481d73FdCB15644A191F74944` on Arbitrum One
- **Error**: `0x052e5515` (error code 5) when calling `quoteResolution()`
- **Configuration**: All standard LayerZero config is correct
- **Attempts**: Multiple executor configurations tried (address(0), explicit, minimal)
- **Chain Pair**: Arbitrum One (30110) → Polygon PoS (30109)
- **Libraries**: SendUln302 configured, ReadLib1002 used by lzRead DVNs
- **DVN Configuration**: Initially used regular DVN addresses; now attempting lzRead-specific DVNs
- **Available lzRead DVNs**: Multiple providers available (LayerZero Labs, Nethermind, Horizen, etc.) - all claim Polygon support

## BREAKTHROUGH FINDING ⭐⭐⭐

### lzRead DVNs ARE Deployed and Support Polygon!

From LayerZero's official `read-addresses.json`, these lzRead DVNs on Arbitrum support Polygon:

| DVN Provider | Address on Arbitrum | Supports Polygon |
|--------------|---------------------|------------------|
| LayerZero Labs | `0x1308151a7ebac14f435d3ad5ff95c34160d539a5` | ✅ |
| Horizen | `0x5cff49d69d79d677dd3e5b38e048a0dcb6d86aaf` | ✅ |
| Nethermind | `0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd` | ✅ |
| BCW Group | `0x05ce650134d943c5e336dc7990e84fb4e69fdf29` | ✅ |
| AltLayer | `0x8ede21203e062d7d1eaec11c4c72ad04cdc15658` | ✅ |
| Nocturnal Labs | `0xfdd2e77a6addc1e18862f43297500d2ebfbd94ac` | ✅ |

### The Actual Blocker

**ReadLib1002 has no default configs set.** Only the owner can set them:

```bash
# Owner of ReadLib1002 (LayerZero multisig)
cast call --rpc-url https://arb1.arbitrum.io/rpc \
  0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf 'owner()(address)'
# Result: 0x9A3cE220D17a92dd4DF9766ceE48fDd0c448bA4f
```

Because `isSupportedEid()` checks default config (which is empty), it returns `false` for all EIDs.
This prevents users from calling `endpoint.setSendLibrary(oapp, eid, ReadLib1002)`.

### Solution

**LayerZero needs to call `setDefaultReadLibConfigs()` on ReadLib1002** to set default DVN/executor for Polygon.

Once that's done:
1. `ReadLib1002.isSupportedEid(30109)` will return `true`
2. We can set ReadLib1002 as our send library
3. `quoteResolution()` will route through ReadLib1002 (which accepts LZREAD options)
4. lzRead will work! 🎉

## Next Steps

1. **Contact LayerZero Support** - Request they call `setDefaultReadLibConfigs()` for Polygon (30109)
   - See `LAYERZERO_SUPPORT_REQUEST.md` for the full request
2. **While Waiting**: Consider fallback Option A (relay pattern with OApp on Polygon)

## Files Created
- `Arb1-Polygon_setLzReadConfig.s.sol` - Full executor/DVN config
- `Arb1-Polygon_setLzReadConfigFixed.s.sol` - Address(0) executor config
- `Arb1-Polygon_setLzReadConfigMinimal.s.sol` - Minimal config (no executor)
- `Arb1-Polygon_setReadLibrary.s.sol` - Read Library config (failed - doesn't support Polygon)
- `Arb1-Polygon_testFeeQuote.s.sol` - Fee quoting diagnostic
- `Arb1-Polygon_debugQuote.s.sol` - Detailed debugging script
- `LAYERZERO_SUPPORT_REQUEST.md` - Support ticket for LayerZero ⭐


