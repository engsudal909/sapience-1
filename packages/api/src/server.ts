import { Sentry } from './sentry';

import 'reflect-metadata';
import { createServer } from 'node:http';
import { expressMiddleware } from '@apollo/server/express4';
import { NextFunction, Request, Response } from 'express';
import { initializeDataSource } from './db';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import { initializeApolloServer } from './graphql/startApolloServer';
import { initializeFixtures } from './fixtures';
import { handleMcpAppRequests } from './routes/mcp';
import prisma from './db';
import { config } from './config';
import { setupWebsocketServer } from './websocket';

export const startServer = async () => {
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

  setupWebsocketServer(httpServer);

  const onListen = () => {
    console.log(`Server is running on port ${config.PORT}`);
    console.log(`GraphQL endpoint available at /graphql`);
    if (config.ENABLE_AUCTION_WS)
      console.log(`Auction WebSocket endpoint at /auction`);
    console.log(`Chat WebSocket endpoint at /chat`);
  };

  httpServer.listen(config.PORT, onListen);

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

  return { httpServer, app };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await startServer();
  } catch (e) {
    console.error('Unable to start server: ', e);
  }
}
