import type { Socket } from 'node:net';
import { STATUS_CODES } from 'node:http';
import { createSentryGauge, Sentry } from '../sentry';

import type { WebSocketServer } from 'ws';

export function closeSocket(socket: Socket, errCode?: number) {
  if (errCode) {
    try {
      const errMsg = STATUS_CODES[errCode] || 'Server Coding Error';
      socket.write(
        `HTTP/1.1 ${errCode} ${errMsg}\r\nConnection: close\r\n\r\n`
      );
    } catch (err) {
      Sentry.captureException(err);
    }
  }

  try {
    socket.destroy();
  } catch (err) {
    Sentry.captureException(err);
  }
}

export function setupConnectionMetrics(
  namespace: string,
  wss: WebSocketServer
) {
  const connectionsCount = createSentryGauge(`websocket.${namespace}.count`);

  wss.on('connection', (ws) => {
    const startedAt = Date.now();
    connectionsCount.increment();

    ws.on('close', () => {
      const duration = Date.now() - startedAt;
      connectionsCount.decrement();
      Sentry.metrics.distribution(`websocket.${namespace}.duration`, duration);
    });
  });
}
