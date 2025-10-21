# Testing Limit Order Indexing

## Quick Verification Checklist

After placing/filling/cancelling orders on Etherscan, verify the indexer is working:

### 1. Check Database Events

```sql
-- Check for OrderPlaced events
SELECT 
  "blockNumber",
  "transactionHash",
  "logData"::jsonb->>'eventType' as event_type,
  "logData"::jsonb->>'orderId' as order_id,
  "logData"::jsonb->>'maker' as maker,
  "timestamp"
FROM event 
WHERE "logData"::jsonb->>'eventType' IN ('OrderPlaced', 'OrderFilled', 'OrderCancelled')
ORDER BY "blockNumber" DESC 
LIMIT 10;
```

### 2. Check LimitOrder Table

```sql
-- Check limit order records
SELECT 
  id,
  "orderId",
  maker,
  taker,
  status,
  "makerCollateral",
  "takerCollateral",
  "placedAt",
  "filledAt",
  "cancelledAt"
FROM limit_order
ORDER BY "createdAt" DESC
LIMIT 10;
```

### 3. Check Order Lifecycle

```sql
-- Verify an order went from pending → filled
SELECT 
  "orderId",
  status,
  maker,
  taker,
  "placedTxHash",
  "filledTxHash"
FROM limit_order
WHERE "orderId" = '1'  -- Replace with your order ID
  AND "chainId" = 42161;
```

### 4. Check Indexer Logs

Look for these log messages:

```
[PredictionMarketIndexer] Processed OrderPlaced: orderId=1, maker=0x...
[PredictionMarketIndexer] Processed OrderFilled: orderId=1, maker=0x..., taker=0x...
[PredictionMarketIndexer] Processed OrderCancelled: orderId=2, maker=0x...
```

## Test Scenarios

### Scenario 1: Happy Path (Place → Fill)
1. ✅ Place order with wallet A
2. ✅ Verify `pending` status in DB
3. ✅ Fill order with wallet B
4. ✅ Verify `filled` status in DB
5. ✅ Verify taker address is set

### Scenario 2: Cancel Path (Place → Cancel)
1. ✅ Place order with wallet A
2. ✅ Verify `pending` status in DB
3. ✅ Cancel order with wallet A (same wallet)
4. ✅ Verify `cancelled` status in DB

### Scenario 3: Multiple Orders
1. ✅ Place 3 orders
2. ✅ Fill order #1
3. ✅ Cancel order #2
4. ✅ Leave order #3 pending
5. ✅ Query: `SELECT * FROM limit_order WHERE status = 'pending'`

## Sample Etherscan Test Values

### Creating Test ConditionIds
For `encodedPredictedOutcomes`, you need an array of (bytes32 conditionId, bool prediction):

```typescript
// Single prediction (YES on some condition)
const outcome1 = ethers.AbiCoder.defaultAbiCoder().encode(
  ['tuple(bytes32,bool)[]'],
  [[
    ['0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', true]
  ]]
);

// Multiple predictions (2 outcomes)
const outcome2 = ethers.AbiCoder.defaultAbiCoder().encode(
  ['tuple(bytes32,bool)[]'],
  [[
    ['0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', true],
    ['0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321', false]
  ]]
);
```

### Test RefCodes (bytes32)
```
"test"    → 0x7465737400000000000000000000000000000000000000000000000000000000
"demo"    → 0x64656d6f00000000000000000000000000000000000000000000000000000000
"promo"   → 0x70726f6d6f000000000000000000000000000000000000000000000000000000
bytes32(0) → 0x0000000000000000000000000000000000000000000000000000000000000000
```

### Test Collateral Amounts
Assuming USDC (6 decimals):
```
1 USDC      → 1000000
10 USDC     → 10000000
100 USDC    → 100000000
0.5 USDC    → 500000
```

## Troubleshooting

### ❌ Order not appearing in database
1. Check indexer is running: `ps aux | grep predictionMarketIndexer`
2. Check for errors in indexer logs
3. Verify block has been processed: check latest indexed block
4. Manually trigger reconciler if needed

### ❌ Transaction fails on Etherscan
1. Check you have enough collateral token approved
2. Verify orderDeadline is in the future
3. For fillOrder: ensure order exists and is unfilled
4. For cancelOrder: ensure you're the maker

### ❌ Status not updating (stays pending after fill)
1. Check the `processOrderFilled` function logs
2. Verify the orderId matches between events
3. Check for errors in the orderError catch block

## Pro Tips

1. **Use block explorer events tab** to see raw events emitted
2. **Keep orderIds sequential** for easier testing (1, 2, 3...)
3. **Use different refCodes** to distinguish test orders
4. **Check both event and limit_order tables** to verify full pipeline
5. **Test reconciler** by stopping indexer, placing orders, then running reconciler

## API Endpoints (Future)

Once GraphQL resolvers are added:

```graphql
query GetPendingOrders {
  limitOrders(where: { status: "pending" }) {
    orderId
    maker
    makerCollateral
    takerCollateral
    predictedOutcomes
    placedAt
  }
}

query GetOrdersByMaker($maker: String!) {
  limitOrders(where: { maker: $maker }) {
    orderId
    status
    taker
    filledAt
    cancelledAt
  }
}
```

