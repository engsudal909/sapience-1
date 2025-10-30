import WebSocket from 'ws';
import type { RawData } from 'ws';

export function createAuctionWs(
  url: string,
  handlers: {
    onOpen?: () => void;
    onMessage?: (msg: any) => void;
    onError?: (err: unknown) => void;
    onClose?: (code: number, reason: Buffer) => void;
  } = {},
) {
  let ws: WebSocket | null = null;
  let retries = 0;

  function connect() {
    ws = new WebSocket(url);

    ws.on('open', () => {
      retries = 0;
      handlers.onOpen?.();
    });

    ws.on('message', (data: RawData) => {
      try {
        const msg = JSON.parse(String(data));
        handlers.onMessage?.(msg);
      } catch (e) {
        handlers.onError?.(e);
      }
    });

    ws.on('error', (err: unknown) => {
      handlers.onError?.(err);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      handlers.onClose?.(code, reason);
      const delay = Math.min(30000, 1000 * 2 ** Math.min(6, retries++));
      setTimeout(connect, delay);
    });
  }

  connect();

  return {
    get socket() {
      return ws;
    },
  };
}


