# LayerZero Support Request: Enable lzRead Default Config for Arbitrum → Polygon

## Summary

We're trying to use **lzRead** from Arbitrum One to read Polygon ConditionalTokens. The lzRead DVNs that support this chain pair are deployed, but **`ReadLib1002.isSupportedEid()` returns `false`** because no default configs have been set. We need LayerZero to call `setDefaultReadLibConfigs()` to enable this.

## The Problem

Fee quoting reverts with `Executor_UnsupportedOptionType(5)` because:

1. `ReadLib1002.isSupportedEid(30109)` returns `false` (no default config)
2. We cannot call `endpoint.setSendLibrary(resolver, eid, ReadLib1002)` — it reverts with `LZ_UnsupportedEid()`
3. Endpoint falls back to `SendUln302`, which rejects `OPTION_TYPE_LZREAD` options

## Evidence That lzRead Infrastructure IS Deployed

From LayerZero's official `read-addresses.json`, these **lzRead DVNs on Arbitrum support Polygon**:

| DVN Provider | Address on Arbitrum | Supports Polygon |
|--------------|---------------------|------------------|
| LayerZero Labs | `0x1308151a7ebac14f435d3ad5ff95c34160d539a5` | ✅ |
| Horizen | `0x5cff49d69d79d677dd3e5b38e048a0dcb6d86aaf` | ✅ |
| Nethermind | `0x14e570a1684c7ca883b35e1b25d2f7cec98a16cd` | ✅ |
| BCW Group | `0x05ce650134d943c5e336dc7990e84fb4e69fdf29` | ✅ |
| AltLayer | `0x8ede21203e062d7d1eaec11c4c72ad04cdc15658` | ✅ |
| Nocturnal Labs | `0xfdd2e77a6addc1e18862f43297500d2ebfbd94ac` | ✅ |

All reference the same `ReadLib1002`: `0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf`

**The DVNs are deployed and ready — but ReadLib1002 has no default config.**

## On-Chain Verification

```bash
# ReadLib1002 has no supported EIDs
cast call --rpc-url https://arb1.arbitrum.io/rpc \
  0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf \
  'isSupportedEid(uint32)(bool)' 30109
# Result: false

# Only owner can set default configs
cast call --rpc-url https://arb1.arbitrum.io/rpc \
  0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf \
  'owner()(address)'
# Result: 0x9A3cE220D17a92dd4DF9766ceE48fDd0c448bA4f  (LayerZero multisig)

# Trying to get default config reverts
cast call --rpc-url https://arb1.arbitrum.io/rpc \
  0x1a44076050125825900e736c501f859c50fE728c \
  'getConfig(address,address,uint32,uint32)(bytes)' \
  0x0000000000000000000000000000000000000000 \
  0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf \
  30109 1
# Reverts with: 0x9b5f9f7a (LZ_RL_AtLeastOneDVN)
```

## Request

**Please call `setDefaultReadLibConfigs()` on ReadLib1002 (`0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf`) on Arbitrum One to enable lzRead for Polygon (EID 30109).**

Suggested default config (using LayerZero Labs DVN):

```solidity
SetDefaultReadLibConfigParam[] memory params = new SetDefaultReadLibConfigParam[](1);
params[0] = SetDefaultReadLibConfigParam({
    eid: 30109,  // Polygon
    config: ReadLibConfig({
        executor: <lzRead executor address>,
        requiredDVNCount: 1,
        optionalDVNCount: 0,
        optionalDVNThreshold: 0,
        requiredDVNs: [0x1308151a7ebac14f435d3ad5ff95c34160d539a5],  // LayerZero Labs lzRead DVN
        optionalDVNs: []
    })
});

ReadLib1002(0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf).setDefaultReadLibConfigs(params);
```

## Questions

1. **Can you set default ReadLib configs for Polygon (30109) on Arbitrum's ReadLib1002?**
   - The lzRead DVNs supporting this chain pair are already deployed.

2. **What executor address should be used for lzRead on Arbitrum?**
   - We need this for the `ReadLibConfig.executor` field.

3. **Is there a different mechanism to enable lzRead without default configs?**
   - Can users set custom ReadLib configs even without defaults?

4. **What is the correct `readChannelEid` for lzRead?**
   - Should it be the local chain (30110) or target chain (30109)?

## Our Use Case

We're building a resolver that uses lzRead to query Polymarket (Gnosis ConditionalTokens) payout data from Polygon for cross-chain prediction market resolution on Arbitrum.

## Technical Details

| Item | Value |
|------|-------|
| Resolver Contract | `0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6` (Arbitrum) |
| Target Contract | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (Polygon ConditionalTokens) |
| ReadLib1002 | `0xbcd4CADCac3F767C57c4F402932C4705DF62BEFf` (Arbitrum) |
| Endpoint V2 | `0x1a44076050125825900e736c501f859c50fE728c` (Arbitrum) |
| Origin Chain | Arbitrum One (EID 30110) |
| Target Chain | Polygon PoS (EID 30109) |

## Error Details

| Selector | Error | Value |
|----------|-------|-------|
| `0x052e5515` | `Executor_UnsupportedOptionType(uint8)` | `5` (LZREAD) |
| `0x9b5f9f7a` | `LZ_RL_AtLeastOneDVN()` | N/A |

The first error occurs because quoting goes through SendUln302 (which rejects LZREAD options).
The second error occurs when trying to get ReadLib config (no DVNs configured).

## Summary

The lzRead DVNs are deployed and support Arb→Polygon. ReadLib1002 just needs default configs set by its owner. Once that's done, we can:

1. `endpoint.setSendLibrary(resolver, channelEid, ReadLib1002)`
2. `resolver.quoteResolution(conditionId)` — should work!
3. `resolver.requestResolution(conditionId)` — cross-chain read to Polygon

Thank you!
