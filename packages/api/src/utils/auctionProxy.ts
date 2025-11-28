import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request, Response } from 'express';
import { config } from '../config';
import http from 'http';

/**
 * Get the auction service URL from environment or default to localhost
 */
function getAuctionServiceUrl(): string {
  const url =
    process.env.AUCTION_SERVICE_URL ||
    (config.isDev ? 'http://localhost:3002' : 'http://localhost:3002');
  return url.replace(/\/$/, ''); // Remove trailing slash
}

/**
 * Create Express middleware to proxy HTTP requests to the auction service
 */
export function createAuctionProxyMiddleware() {
  const target = getAuctionServiceUrl();

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: false, // We handle WebSocket upgrades separately
    logLevel: config.isDev ? 'debug' : 'warn',
    onError: (err, req, res) => {
      console.error('[Auction Proxy] Error proxying request:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Auction service unavailable' });
      }
    },
    onProxyReq: (proxyReq, req) => {
      // Preserve original host header for proper routing
      if (req.headers.host) {
        proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
      }
    },
  });
}

/**
 * Proxy WebSocket upgrade requests to the auction service
 */
export async function proxyAuctionWebSocket(
  request: import('http').IncomingMessage,
  socket: import('net').Socket,
  head: Buffer
): Promise<boolean> {
  const target = getAuctionServiceUrl();
  const url = new URL(request.url || '/auction', target);

  return new Promise((resolve) => {
    // Create proxy request with upgrade header
    const proxyReq = http.request({
      hostname: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: request.method,
      headers: {
        ...request.headers,
        host: url.host,
        connection: 'upgrade',
        upgrade: 'websocket',
      },
    });

    proxyReq.on('error', (err: Error) => {
      console.error('[Auction Proxy] WebSocket proxy error:', err.message);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(false);
    });

    proxyReq.on('upgrade', (proxyRes: import('http').IncomingMessage, proxySocket: import('net').Socket, proxyHead: Buffer) => {
      // Upgrade successful, pipe the connection
      proxySocket.on('error', (err: Error) => {
        console.error('[Auction Proxy] Proxy socket error:', err.message);
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      });

      socket.on('error', (err: Error) => {
        console.error('[Auction Proxy] Client socket error:', err.message);
        try {
          proxySocket.destroy();
        } catch {
          /* ignore */
        }
      });

      // Write upgrade response to client
      socket.write(
        `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
      );
      Object.keys(proxyRes.headers).forEach((key) => {
        const value = proxyRes.headers[key];
        if (value && key.toLowerCase() !== 'connection' && key.toLowerCase() !== 'upgrade') {
          socket.write(`${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`);
        }
      });
      socket.write('Connection: Upgrade\r\n');
      socket.write('Upgrade: websocket\r\n');
      socket.write('\r\n');

      // Handle head data first
      if (head && head.length > 0) {
        proxySocket.write(head);
      }
      if (proxyHead && proxyHead.length > 0) {
        socket.write(proxyHead);
      }

      // Pipe data between sockets (bidirectional)
      proxySocket.on('data', (chunk: Buffer) => {
        if (socket.writable) {
          socket.write(chunk);
        }
      });

      socket.on('data', (chunk: Buffer) => {
        if (proxySocket.writable) {
          proxySocket.write(chunk);
        }
      });

      proxySocket.on('close', () => {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      });

      socket.on('close', () => {
        try {
          proxySocket.destroy();
        } catch {
          /* ignore */
        }
      });

      resolve(true);
    });

    // Send upgrade request with head data
    proxyReq.end(head);
  });
}

