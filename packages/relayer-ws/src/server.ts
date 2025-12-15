import { createServer } from 'http';
import { createAuctionWebSocketServer } from './ws';
import { initSentry } from './instrument';
import { config } from './config';
import { getMetrics } from './metrics';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

const PORT = parseInt(config.PORT, 10);

initSentry();

const startServer = async () => {
  const httpServer = createServer(async (req, res) => {
    // Expose metrics endpoint
    if (req.url === '/metrics' && req.method === 'GET') {
      try {
        const metrics = await getMetrics();
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(metrics);
      } catch (err) {
        console.error('[Metrics] Error generating metrics:', err);
        res.writeHead(500);
        res.end('Error generating metrics');
      }
      return;
    }

    // Health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // 404 for other routes
    res.writeHead(404);
    res.end('Not Found');
  });

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
    console.log(`Relayer service is running on port ${PORT}`);
    console.log(`Metrics endpoint: http://localhost:${PORT}/metrics`);
    console.log(`Health check endpoint: http://localhost:${PORT}/health`);
    if (auctionWsEnabled) {
      console.log(`WebSocket endpoint: ws://localhost:${PORT}/auction`);
    }
  });
};

startServer().catch((err) => {
  console.error('Failed to start auction server:', err);
  process.exit(1);
});

