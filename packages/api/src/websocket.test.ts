import { createServer } from 'node:http';
import { beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { setupWebsocketServer } from './websocket';

function assertWebsocketConneciton(endpoint: string) {
  const ws = new WebSocket(endpoint);

  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log('connected', endpoint);
      ws.close();
    });

    ws.on('close', () => {
      console.log('closed', endpoint);
      resolve(null);
    });

    ws.on('error', (err) => {
      console.error('ws error', endpoint);
      reject(err);
    });
  });
}

describe('server websocket upgrades', () => {
  let endpoint: string;

  beforeEach(async () => {
    const httpServer = createServer();
    setupWebsocketServer(httpServer);
    await new Promise((resolve) => httpServer.listen(0, () => resolve(null)));
    const { port } = httpServer.address() as { port: number };
    endpoint = `ws://localhost:${port}`;
  });

  it('handles chat upgrades and emits connection', async () => {
    await assertWebsocketConneciton(`${endpoint}/chat`);
  });
});
