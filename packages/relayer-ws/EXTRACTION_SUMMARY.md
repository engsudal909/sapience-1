# Auction WebSocket Service Extraction - Summary

## ✅ Completed Tasks

### 1. Package Extraction
- ✅ Created new standalone package at `packages/relayer-ws/`
- ✅ Package name: `@sapience/relayer` (workspace package)
- ✅ Moved all auction code from `packages/api/src/auction/` to `packages/relayer-ws/src/`
- ✅ Extracted shared dependencies:
  - `getProviderForChain` utility for blockchain RPC
  - Constants (prediction market addresses)
  - Sentry integration
  - Config management

### 2. Standalone Server
- ✅ Created `packages/relayer-ws/src/server.ts` as standalone entry point
- ✅ Service runs on port 3002 (configurable via `PORT` env var)
- ✅ WebSocket endpoint: `ws://localhost:3002/auction`

### 3. API Package Cleanup
- ✅ Removed auction WebSocket integration from `packages/api/src/server.ts`
- ✅ Removed auction imports and handlers
- ✅ Deleted old `packages/api/src/auction/` folder
- ✅ Updated `packages/api/AGENTS.md` documentation

### 4. Deployment Configuration
- ✅ Updated `render.yaml` with new `relayer-ws` service
- ✅ Updated `render-build-sdk.sh` to include auction dependencies
- ✅ Service configured for Render.com deployment

### 5. Documentation
- ✅ Created `README.md` with API documentation
- ✅ Created `DEPLOYMENT.md` with deployment guide
- ✅ Created `EXTRACTION_NOTES.md` with migration notes
- ✅ Updated root `package.json` with `dev:auction` script

### 6. Package Configuration
- ✅ `package.json` with correct dependencies
- ✅ `tsconfig.json` for TypeScript compilation
- ✅ `eslint.config.js` for linting
- ✅ `.gitignore` for build artifacts

## 📁 Package Structure

```
packages/relayer-ws/
├── src/
│   ├── server.ts          # Standalone server entry point
│   ├── ws.ts              # WebSocket server implementation
│   ├── registry.ts        # Auction registry (in-memory)
│   ├── helpers.ts         # Validation and signature helpers
│   ├── sim.ts             # Bid simulation/validation
│   ├── types.ts           # TypeScript type definitions
│   ├── relayer.ts         # Relayer utilities
│   ├── botExample.ts      # Example bot implementation
│   ├── config.ts          # Configuration management
│   ├── instrument.ts      # Sentry integration
│   ├── constants.ts       # Constants (contract addresses)
│   └── utils/
│       └── getProviderForChain.ts  # Blockchain RPC utility
├── package.json
├── tsconfig.json
├── eslint.config.js
├── README.md
├── DEPLOYMENT.md
├── EXTRACTION_NOTES.md
└── .gitignore
```

## 🚀 Running the Service

### Development
```bash
# From repo root
pnpm dev:auction

# Or directly
pnpm --filter @sapience/relayer run dev
```

### Production
```bash
pnpm --filter @sapience/relayer run start
```

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 3002)
- `ENABLE_AUCTION_WS`: Enable WebSocket (default: true)
- `NODE_ENV`: Environment (development/production/test)
- `INFURA_API_KEY`: Optional Infura API key
- `RPC_URL`: Optional custom RPC URL

## 🔄 Next Steps for Production

1. **Deploy to Render** (Recommended)
   - Service is already configured in `render.yaml`
   - Render handles routing internally - no nginx needed
   - Set environment variables in Render dashboard
   - Service will auto-deploy on push to main branch

2. **Self-Hosted Setup** (Alternative)
   - If self-hosting, set up a reverse proxy (nginx, etc.) to route `/auction` to the auction service
   - This allows frontend to continue using same URL pattern

3. **Update Frontend** (Alternative)
   - Update `packages/sapience/src/lib/ws.ts` to point to auction service
   - Or use environment variable for auction service URL

3. **Deploy to Render**
   - Service is already configured in `render.yaml`
   - Set environment variables in Render dashboard
   - Service will auto-deploy on push to main branch

4. **Monitor & Scale**
   - Monitor WebSocket connections
   - Consider horizontal scaling with sticky sessions
   - Or implement shared state (Redis) for multi-instance deployments

## 📝 Notes

- The service uses in-memory storage for auctions (Map-based registry)
- Auctions expire after their deadline (default 60s, max 5 minutes)
- Cleanup runs every 30 seconds
- Rate limiting: 100 messages per 10 seconds
- Message size limit: 64KB

## 🔗 Related Files

- Frontend WebSocket client: `packages/sapience/src/lib/ws/AuctionWsClient.ts`
- Frontend hooks: `packages/sapience/src/lib/auction/`
- SDK relayer: `packages/sdk/relayer/auctionWs.ts`

