import { Sentry } from './sentry';

import 'reflect-metadata';
import { createServer } from 'node:http';
import { expressMiddleware } from '@apollo/server/express4';
import { NextFunction, Request, Response } from 'express';
import { initializeDataSource } from './db';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import { createAuctionWebSocketServer } from './auction/ws';
import { createChatWebSocketServer } from './websocket/chat';
import { initializeApolloServer } from './graphql/startApolloServer';
import { initializeFixtures } from './fixtures';
import { handleMcpAppRequests } from './routes/mcp';
import prisma from './db';
import { config } from './config';
import { validateOrigin } from './utils/url';
import { closeSocket, setupConnectionMetrics } from './utils/socket';

import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

const startServer = async () => {
  await initializeDataSource();

  if (config.isDev && process.env.DATABASE_URL?.includes('render')) {
    console.log(
      'Skipping fixtures initialization since we are in development mode and using production database'
    );
  } else {
    // Initialize fixtures from fixtures.json
    await initializeFixtures();
  }

  const apolloServer = await initializeApolloServer();

  // Add GraphQL endpoint
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async () => ({
        loaders: createLoaders(),
        prisma,
      }),
    })
  );

  handleMcpAppRequests(app, '/mcp');

  const httpServer = createServer(app);

  // Create WebSocket servers (noServer mode) and route upgrades centrally
  const auctionWsEnabled = process.env.ENABLE_AUCTION_WS !== 'false';
  const auctionWss = auctionWsEnabled ? createAuctionWebSocketServer() : null;
  const chatWss = createChatWebSocketServer();

  setupConnectionMetrics('chat', chatWss);
  if (auctionWss) {
    setupConnectionMetrics('auction', auctionWss);
  }

  httpServer.on(
    'upgrade',
    (request: IncomingMessage, socket: Socket, head: Buffer) => {
      if (!request.url) return closeSocket(socket, 403);

      const uri = new URL(request.url);

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
        if (auctionWsEnabled && auctionWss) {
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

  httpServer.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
    console.log(`GraphQL endpoint available at /graphql`);
    if (auctionWsEnabled) console.log(`Auction WebSocket endpoint at /auction`);
    console.log(`Chat WebSocket endpoint at /chat`);
  });

  if (config.isProd) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Global error handle
  // Needs the unused _next parameter to be passed in: https://expressjs.com/en/guide/error-handling.html
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('An error occurred:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });
};

try {
  await startServer();
} catch (e) {
  console.error('Unable to start server: ', e);
}
