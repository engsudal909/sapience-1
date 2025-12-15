#!/usr/bin/env tsx
/**
 * Load Test Script for Relayer WebSocket Service
 * 
 * This script performs load testing on the relayer-ws service by:
 * - Creating multiple concurrent WebSocket connections
 * - Sending messages at a specified rate
 * - Tracking connection success/failure
 * - Measuring latency and throughput
 * 
 * Usage:
 *   tsx load-test.ts                    # Default: 10 connections, 1 msg/sec
 *   tsx load-test.ts --connections 50   # 50 concurrent connections
 *   tsx load-test.ts --rate 10          # 10 messages per second per connection
 *   tsx load-test.ts --duration 60      # Run for 60 seconds
 *   tsx load-test.ts --url ws://localhost:3002/auction
 */

import WebSocket from 'ws';
import { parseArgs } from 'util';

const args = parseArgs({
  options: {
    connections: { type: 'string', default: '10' },
    rate: { type: 'string', default: '1' }, // messages per second per connection
    duration: { type: 'string', default: '30' }, // seconds
    url: { type: 'string', default: 'ws://localhost:3002/auction' },
    help: { type: 'boolean', default: false },
  },
});

if (args.values.help) {
  console.log(`
Load Test for Relayer WebSocket Service

Options:
  --connections <n>   Number of concurrent connections (default: 10)
  --rate <n>          Messages per second per connection (default: 1)
  --duration <n>      Test duration in seconds (default: 30)
  --url <url>         WebSocket URL (default: ws://localhost:3002/auction)
  --help              Show this help message

Example:
  tsx load-test.ts --connections 50 --rate 5 --duration 60
`);
  process.exit(0);
}

const CONNECTIONS = parseInt(args.values.connections || '10', 10);
const RATE = parseFloat(args.values.rate || '1');
const DURATION = parseInt(args.values.duration || '30', 10);
const WS_URL = args.values.url || 'ws://localhost:3002/auction';

interface ConnectionStats {
  connected: boolean;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  latencies: number[];
  lastMessageTime?: number;
}

const stats: Map<number, ConnectionStats> = new Map();
let globalStartTime: number;
let totalConnections = 0;
let successfulConnections = 0;
let failedConnections = 0;

function createTestPayload(connectionId: number, messageId: number) {
  return {
    type: 'auction.start',
    payload: {
      taker: `0x${connectionId.toString(16).padStart(40, '0')}`,
      wager: '1000000000000000000', // 1 ETH
      resolver: '0x0000000000000000000000000000000000000000',
      predictedOutcomes: ['0xdeadbeef'],
      takerNonce: messageId,
      chainId: 42161,
    },
  };
}

function createConnection(id: number): Promise<void> {
  return new Promise((resolve) => {
    const connectionStats: ConnectionStats = {
      connected: false,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      latencies: [],
    };
    stats.set(id, connectionStats);

    let ws: WebSocket | null = null;
    let messageInterval: NodeJS.Timeout | null = null;
    let messageId = 0;

    const cleanup = () => {
      if (messageInterval) {
        clearInterval(messageInterval);
        messageInterval = null;
      }
      if (ws) {
        ws.removeAllListeners();
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        ws = null;
      }
    };

    const sendMessage = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const payload = createTestPayload(id, messageId++);
      const sendTime = Date.now();
      connectionStats.lastMessageTime = sendTime;
      connectionStats.messagesSent++;

      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        connectionStats.errors++;
        console.error(`[Connection ${id}] Error sending message:`, err);
      }
    };

    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      connectionStats.connected = true;
      successfulConnections++;
      totalConnections++;

      // Send messages at the specified rate
      const intervalMs = RATE > 0 ? 1000 / RATE : 0;
      if (intervalMs > 0) {
        messageInterval = setInterval(sendMessage, intervalMs);
        // Send first message immediately
        sendMessage();
      }

      resolve();
    });

    ws.on('message', (data: WebSocket.RawData) => {
      connectionStats.messagesReceived++;
      const receiveTime = Date.now();
      
      if (connectionStats.lastMessageTime) {
        const latency = receiveTime - connectionStats.lastMessageTime;
        connectionStats.latencies.push(latency);
        // Keep only last 1000 latencies to avoid memory issues
        if (connectionStats.latencies.length > 1000) {
          connectionStats.latencies.shift();
        }
      }

      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auction.ack') {
          // Message acknowledged
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      connectionStats.errors++;
      connectionStats.connected = false;
      failedConnections++;
      console.error(`[Connection ${id}] Error:`, err.message);
      cleanup();
      resolve();
    });

    ws.on('close', () => {
      connectionStats.connected = false;
      cleanup();
    });

    // Connection timeout
    setTimeout(() => {
      if (!connectionStats.connected) {
        failedConnections++;
        totalConnections++;
        cleanup();
        resolve();
      }
    }, 5000);
  });
}

async function runLoadTest() {
  console.log('🚀 Starting Load Test');
  console.log('========================================');
  console.log(`Target URL: ${WS_URL}`);
  console.log(`Connections: ${CONNECTIONS}`);
  console.log(`Rate: ${RATE} msg/sec per connection`);
  console.log(`Duration: ${DURATION} seconds`);
  console.log('========================================\n');

  globalStartTime = Date.now();

  // Create all connections
  console.log(`Creating ${CONNECTIONS} connections...`);
  const connectionPromises: Promise<void>[] = [];
  
  // Stagger connections slightly to avoid thundering herd
  for (let i = 0; i < CONNECTIONS; i++) {
    connectionPromises.push(createConnection(i));
    if (i < CONNECTIONS - 1) {
      await new Promise(resolve => setTimeout(resolve, 10)); // 10ms delay between connections
    }
  }

  await Promise.all(connectionPromises);

  console.log(`\n✅ All connections established (${successfulConnections} successful, ${failedConnections} failed)`);
  console.log('Running test...\n');

  // Run for specified duration
  await new Promise(resolve => setTimeout(resolve, DURATION * 1000));

  // Close all connections
  console.log('\nClosing connections...');
  for (const [id, stat] of stats.entries()) {
    // Connections will close naturally
  }

  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Print results
  printResults();
}

function printResults() {
  const totalMessagesSent = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.messagesSent,
    0
  );
  const totalMessagesReceived = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.messagesReceived,
    0
  );
  const totalErrors = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.errors,
    0
  );

  const allLatencies = Array.from(stats.values())
    .flatMap(s => s.latencies)
    .sort((a, b) => a - b);

  const avgLatency =
    allLatencies.length > 0
      ? allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length
      : 0;
  const p50Latency =
    allLatencies.length > 0
      ? allLatencies[Math.floor(allLatencies.length * 0.5)]
      : 0;
  const p95Latency =
    allLatencies.length > 0
      ? allLatencies[Math.floor(allLatencies.length * 0.95)]
      : 0;
  const p99Latency =
    allLatencies.length > 0
      ? allLatencies[Math.floor(allLatencies.length * 0.99)]
      : 0;

  const actualDuration = (Date.now() - globalStartTime) / 1000;
  const msgPerSec = totalMessagesSent / actualDuration;
  const receivedPerSec = totalMessagesReceived / actualDuration;

  console.log('\n📊 Load Test Results');
  console.log('========================================');
  console.log(`Duration: ${actualDuration.toFixed(2)}s`);
  console.log(`Connections: ${successfulConnections}/${CONNECTIONS} successful`);
  console.log(`Messages Sent: ${totalMessagesSent} (${msgPerSec.toFixed(2)} msg/sec)`);
  console.log(`Messages Received: ${totalMessagesReceived} (${receivedPerSec.toFixed(2)} msg/sec)`);
  console.log(`Errors: ${totalErrors}`);
  console.log(`Success Rate: ${totalMessagesReceived > 0 ? ((totalMessagesReceived / totalMessagesSent) * 100).toFixed(2) : 0}%`);
  console.log('\nLatency Statistics:');
  console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50: ${p50Latency.toFixed(2)}ms`);
  console.log(`  P95: ${p95Latency.toFixed(2)}ms`);
  console.log(`  P99: ${p99Latency.toFixed(2)}ms`);
  console.log('========================================\n');

  // Check metrics endpoint
  try {
    const url = new URL(WS_URL);
    const metricsUrl = `http://${url.host}/metrics`;
    console.log(`💡 Tip: Check service metrics at ${metricsUrl}`);
  } catch {
    // Ignore URL parse errors
  }
}

// Run the test
runLoadTest().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});

