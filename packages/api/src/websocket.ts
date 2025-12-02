import { config } from './config';
import { createAuctionWebSocketServer } from './auction/ws';
import { createChatWebSocketServer } from './websocket/chat';
import { validateOrigin } from './utils/url';
import { closeSocket, setupConnectionMetrics } from './utils/socket';

import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

// Create WebSocket servers (noServer mode) and route upgrades centrally
export function setupWebsocketServer(
  httpServer: Server<typeof IncomingMessage, typeof ServerResponse>
) {
  const auctionWss = config.ENABLE_AUCTION_WS
    ? createAuctionWebSocketServer()
    : null;
  const chatWss = createChatWebSocketServer();

  setupConnectionMetrics('chat', chatWss);
  if (auctionWss) {
    setupConnectionMetrics('auction', auctionWss);
  }

  httpServer.on(
    'upgrade',
    (request: IncomingMessage, socket: Socket, head: Buffer) => {
      if (!request.url) return closeSocket(socket, 403);

      const base = request.headers?.host
        ? `http://${request.headers.host}`
        : 'http://localhost';

      let uri: URL;
      try {
        uri = new URL(request.url!, base);
      } catch {
        return closeSocket(socket, 400); // or handle error
      }

      if (uri.pathname === '/chat') {
        const allowedOrigins = config.CHAT_ALLOWED_ORIGINS;

        // Origin validation if configured
        if (
          allowedOrigins.length &&
          !validateOrigin(request, config.CHAT_ALLOWED_ORIGINS)
        ) {
          return closeSocket(socket, 401);
        }

        chatWss.handleUpgrade(request, socket, head, (ws) => {
          chatWss.emit('connection', ws, request);
        });

        return;
      }

      if (uri.pathname === '/auction') {
        if (config.ENABLE_AUCTION_WS && auctionWss) {
          auctionWss.handleUpgrade(request, socket, head, (ws) => {
            auctionWss.emit('connection', ws, request);
          });
        } else {
          closeSocket(socket, 410);
        }

        return;
      }

      return closeSocket(socket, 404);
    }
  );
}
