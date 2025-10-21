# Limit Order Table Setup

This guide will help you complete the setup for limit order indexing.

## What Was Added

### 1. Database Schema (`prisma/schema.prisma`)
- **New `LimitOrder` model** - Tracks the lifecycle of on-chain limit orders
- **New `LimitOrderStatus` enum** - Status values: `pending`, `filled`, `cancelled`

### 2. Indexer Updates (`src/workers/indexers/predictionMarketIndexer.ts`)
- **Added ABIs** for `OrderPlaced`, `OrderFilled`, `OrderCancelled` events
- **Added event processing** methods for all three limit order events
- **Database integration** - Creates and updates `LimitOrder` records

### 3. Migration File
- Created at: `prisma/migrations/add_limit_order_table/migration.sql`

## Setup Steps

### 1. Apply the Database Migration

Make sure your database is running, then:

```bash
cd packages/api
npx prisma migrate deploy
```

Or if you're in development:

```bash
cd packages/api
npx prisma migrate dev
```

### 2. Regenerate Prisma Client

```bash
cd packages/api
npx prisma generate
```

### 3. Verify the Setup

Check that TypeScript recognizes the new types:

```bash
cd packages/api
npm run build
```

## How It Works

### Event Flow

1. **OrderPlaced** → Creates new `LimitOrder` with status `pending`
2. **OrderFilled** → Updates `LimitOrder` to status `filled`, adds taker info
3. **OrderCancelled** → Updates `LimitOrder` to status `cancelled`

### Data Model

```typescript
LimitOrder {
  id: number
  chainId: number
  orderId: string          // On-chain order ID
  maker: string
  resolver: string
  status: 'pending' | 'filled' | 'cancelled'
  
  makerCollateral: string
  takerCollateral: string
  predictedOutcomes: JSON  // [{ conditionId, prediction }]
  
  placedAt: number         // Timestamp
  filledAt?: number
  cancelledAt?: number
  
  taker?: string          // Set when filled
  
  placedTxHash: string
  filledTxHash?: string
  cancelledTxHash?: string
}
```

## Querying Limit Orders

### Get all pending orders
```typescript
const pendingOrders = await prisma.limitOrder.findMany({
  where: { status: 'pending' }
});
```

### Get orders by maker
```typescript
const makerOrders = await prisma.limitOrder.findMany({
  where: {
    maker: '0x...',
    chainId: 8453
  }
});
```

### Get specific order
```typescript
const order = await prisma.limitOrder.findUnique({
  where: {
    chainId_marketAddress_orderId: {
      chainId: 8453,
      marketAddress: '0x...',
      orderId: '123'
    }
  }
});
```

## Reconciler Integration

The parlay reconciler will automatically pick up limit order events because it:
1. Fetches all logs from the PredictionMarket contract
2. Passes them to `indexer.processLog()` 
3. Which now routes to the new limit order processing methods

✅ No changes needed to the reconciler!

## Testing

After setup, you can test by:

1. **Placing a test order** on-chain
2. **Checking the database**:
   ```sql
   SELECT * FROM limit_order ORDER BY "createdAt" DESC LIMIT 10;
   ```
3. **Verifying event storage**:
   ```sql
   SELECT * FROM event WHERE "logData"::text LIKE '%OrderPlaced%';
   ```

## GraphQL Integration (Optional)

To expose limit orders via GraphQL, you'll need to:

1. Add TypeGraphQL resolvers in `src/graphql/resolvers/`
2. Add queries/mutations for limit order operations
3. Update the GraphQL schema generation

---

**Note**: The TypeScript linter errors will disappear once you run `npx prisma generate`.

