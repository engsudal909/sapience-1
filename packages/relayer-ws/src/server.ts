import { createServer } from 'http';
import { createAuctionWebSocketServer } from './ws';
import { initSentry } from './instrument';
import { config } from './config';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

const PORT = parseInt(config.PORT, 10);

initSentry();

const startServer = async () => {
  const httpServer = createServer();

  // Create WebSocket server
  const auctionWsEnabled = config.ENABLE_AUCTION_WS;
  const auctionWss = auctionWsEnabled ? createAuctionWebSocketServer() : null;

  httpServer.on(
    'upgrade',
    (request: IncomingMessage, socket: Socket, head: Buffer) => {
      try {
        const url = request.url || '/';
        
        // Route /auction WebSocket connections
        if (auctionWsEnabled && url.startsWith('/auction') && auctionWss) {
          auctionWss.handleUpgrade(request, socket, head, (ws) => {
            auctionWss.emit('connection', ws, request);
          });
          return;
        }
        
        // If not handled, destroy the socket
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    }
  );

  httpServer.listen(PORT, () => {
    console.log(`Auction service is running on port ${PORT}`);
    if (auctionWsEnabled) {
      console.log(`Auction WebSocket endpoint at ws://localhost:${PORT}/auction`);
    }
  });
};

startServer().catch((err) => {
  console.error('Failed to start auction server:', err);
  process.exit(1);
});

