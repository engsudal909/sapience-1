import { createServer } from 'node:http';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { setupWebsocketServer } from './websocket';
import { config } from './config';

vi.mock('./config', () => ({
  config: {
    CHAT_ALLOWED_ORIGINS: [],
    ENABLE_AUCTION_WS: true,
  },
}));

const mutableConfig = config as unknown as {
  CHAT_ALLOWED_ORIGINS: string[];
  ENABLE_AUCTION_WS: boolean;
};

function assertWebsocketConneciton(
  endpoint: string,
  origin = 'http://127.0.0.1:3000'
) {
  const ws = new WebSocket(endpoint, {
    headers: { Origin: origin },
  });

  return new Promise((resolve, reject) => {
    ws.on('error', (err) => reject(err));
    ws.on('close', () => resolve(true)); // resolve on correct close
    ws.on('open', () => ws.close()); // close as soon it correctly connects
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

  it('rejects disallowed chat origins', async () => {
    mutableConfig.CHAT_ALLOWED_ORIGINS = ['https://sapience.test'];

    try {
      await expect(
        assertWebsocketConneciton(
          `${endpoint}/chat`,
          'https://evil-sapience.test'
        )
      ).rejects.toThrow('Unexpected server response: 401');
    } finally {
      mutableConfig.CHAT_ALLOWED_ORIGINS = [];
    }
  });

  it('allows chat connection from configured origin', async () => {
    mutableConfig.CHAT_ALLOWED_ORIGINS = ['https://sapience.test'];

    try {
      await expect(
        assertWebsocketConneciton(`${endpoint}/chat`, 'https://sapience.test')
      ).resolves.toEqual(true);
    } finally {
      mutableConfig.CHAT_ALLOWED_ORIGINS = [];
    }
  });

  it('handles /chat upgrades and emits connection', async () => {
    await expect(
      assertWebsocketConneciton(`${endpoint}/chat`)
    ).resolves.toEqual(true);
  });

  it('rejects auction upgrades when disabled', async () => {
    mutableConfig.ENABLE_AUCTION_WS = false;

    try {
      await expect(
        assertWebsocketConneciton(`${endpoint}/auction`)
      ).rejects.toThrow('Unexpected server response: 410');
    } finally {
      mutableConfig.ENABLE_AUCTION_WS = true;
    }
  });

  it('handles /auction upgrades and emits connection', async () => {
    await expect(
      assertWebsocketConneciton(`${endpoint}/auction`)
    ).resolves.toEqual(true);
  });
});
