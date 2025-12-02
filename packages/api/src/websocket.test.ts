import { createServer } from 'node:http';
import { beforeAll, describe, it } from 'vitest';
import WebSocket from 'ws';
import { setupWebsocketServer } from './websocket';

function assertWebsocketConneciton(endpoint: string) {
  const ws = new WebSocket(endpoint);
  return new Promise((resolve, reject) => {
    ws.on('open', () => ws.close()); // close as soon it correctly connects
    ws.on('close', () => resolve(null)); // resolve on correct close
    ws.on('error', (err) => reject(err));
  });
}

describe('server websocket upgrades', () => {
  let endpoint: string;

  beforeAll(async () => {
    const httpServer = createServer();
    setupWebsocketServer(httpServer);
    await new Promise((resolve) => httpServer.listen(0, () => resolve(null)));
    const { port } = httpServer.address() as { port: number };
    endpoint = `ws://localhost:${port}`;
  });

  it('handles /chat upgrades and emits connection', async () => {
    await assertWebsocketConneciton(`${endpoint}/chat`);
  });

  it('handles /auction upgrades and emits connection', async () => {
    await assertWebsocketConneciton(`${endpoint}/auction`);
  });
});
