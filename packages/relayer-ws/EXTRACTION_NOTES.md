# Auction WebSocket Service Extraction Notes

## Summary

The auction WebSocket service has been successfully extracted from `packages/api` into a standalone package at `packages/relayer-ws`. The service is now independent and can be deployed separately.

## What Changed

### New Package Structure
- **Location**: `packages/relayer-ws/`
- **Package Name**: `@sapience/relayer`
- **Port**: Defaults to `3002` (configurable via `PORT` env var)
- **Endpoint**: WebSocket at `ws://localhost:3002/auction`

### Removed from API Package
- Auction WebSocket server integration removed from `packages/api/src/server.ts`
- Auction code still exists in `packages/api/src/auction/` but is no longer used
  - **Note**: You can safely delete `packages/api/src/auction/` folder after verifying the extraction works

### Dependencies Extracted
- `getProviderForChain` utility moved to `packages/relayer-ws/src/utils/getProviderForChain.ts`
- Constants moved to `packages/relayer-ws/src/constants.ts`
- Sentry integration moved to `packages/relayer-ws/src/instrument.ts`
- Config moved to `packages/relayer-ws/src/config.ts`

## Running the Service

### Development
```bash
# From repo root
pnpm dev:auction

# Or from relayer package
pnpm --filter @sapience/relayer run dev
```

### Production
```bash
pnpm --filter @sapience/relayer run start
```

## Frontend Integration

The frontend currently constructs the auction WebSocket URL from the API base URL. You have several options:

### Option 1: Render.com (Recommended)
If deploying to Render, the service is configured in `render.yaml` and Render handles routing internally. No additional reverse proxy setup needed.

### Option 2: Self-Hosted Reverse Proxy
If self-hosting, use nginx or another reverse proxy to route `/auction` requests to the auction service. This allows the frontend to continue using the same URL pattern (`ws://api.example.com/auction`).

### Option 3: Update Frontend Configuration
Update the frontend to use a separate auction service URL. Modify:
- `packages/sapience/src/lib/ws.ts` - `toAuctionWsUrl` function
- Environment variables for auction service URL


## Environment Variables

The auction service uses these environment variables:
- `PORT`: Server port (default: 3002)
- `ENABLE_AUCTION_WS`: Enable WebSocket (default: true)
- `NODE_ENV`: Environment (development/production/test)
- `INFURA_API_KEY`: Optional Infura API key for blockchain RPC
- `RPC_URL`: Optional custom RPC URL for specific chains

## Testing

1. Start the relayer-ws service:
   ```bash
   pnpm dev:auction
   ```

2. Test WebSocket connection:
   ```bash
   # In another terminal
   pnpm --filter @sapience/relayer run bot
   ```

3. Verify the service is running:
   - Check console for: `Auction service is running on port 3002`
   - Check console for: `Auction WebSocket endpoint at ws://localhost:3002/auction`

## Next Steps

1. **Delete old auction folder** (after verification):
   ```bash
   rm -rf packages/api/src/auction
   ```

2. **Set up reverse proxy** (if using Option 1) to route `/auction` to the new service

3. **Update deployment configuration** (e.g., `render.yaml`) to include the relayer-ws service

4. **Update documentation** to reflect the new service architecture

## Bot Example

The bot example has been updated to use `FOIL_AUCTION_BASE` environment variable instead of `FOIL_API_BASE`:

```bash
FOIL_AUCTION_BASE=http://localhost:3002 pnpm --filter @sapience/relayer run bot
```

