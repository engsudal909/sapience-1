# Load Testing Guide for Relayer WebSocket Service

This guide covers different approaches to load test the relayer-ws service.

## Quick Start (Built-in Script)

The simplest way to load test is using the included script:

```bash
# Basic test: 10 connections, 1 msg/sec per connection, 30 seconds
pnpm --filter @sapience/relayer run load-test

# Custom test: 50 connections, 5 msg/sec, 60 seconds
pnpm --filter @sapience/relayer run load-test -- --connections 50 --rate 5 --duration 60

# Test against production
pnpm --filter @sapience/relayer run load-test -- --url wss://relayer.sapience.xyz/auction --connections 100 --rate 10
```

### Script Options

- `--connections <n>` - Number of concurrent WebSocket connections (default: 10)
- `--rate <n>` - Messages per second per connection (default: 1)
- `--duration <n>` - Test duration in seconds (default: 30)
- `--url <url>` - WebSocket URL (default: ws://localhost:3002/auction)
- `--help` - Show help message

### What It Measures

- Connection success/failure rate
- Messages sent/received throughput
- Message latency (average, P50, P95, P99)
- Error rate
- Success rate (responses received / messages sent)

## Method 1: Artillery (Recommended for Advanced Testing)

Artillery is a powerful load testing toolkit with excellent WebSocket support.

### Installation

```bash
npm install -g artillery
```

### Create Artillery Config (`artillery-config.yml`)

```yaml
config:
  target: "ws://localhost:3002"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Ramp up load"
    - duration: 180
      arrivalRate: 50
      name: "Sustained load"
  processor: "./artillery-processor.js"
scenarios:
  - name: "Auction WebSocket Test"
    weight: 100
    engine: ws
    flow:
      - connect:
          url: "/auction"
      - think: 1
      - send:
          message:
            type: "auction.start"
            payload:
              taker: "0x{{ $randomString(40, '0123456789abcdef') }}"
              wager: "1000000000000000000"
              resolver: "0x0000000000000000000000000000000000000000"
              predictedOutcomes: ["0xdeadbeef"]
              takerNonce: "{{ $randomInt(1, 1000) }}"
              chainId: 42161
      - think: 2
      - send:
          message:
            type: "auction.subscribe"
            payload:
              auctionId: "{{ auctionId }}"
      - think: 5
```

### Run Artillery

```bash
artillery run artillery-config.yml
```

## Method 2: k6 (Modern, Fast)

k6 is a modern load testing tool written in Go with JavaScript-based scripting.

### Installation

```bash
# macOS
brew install k6

# Or download from https://k6.io/docs/getting-started/installation/
```

### Create k6 Script (`k6-load-test.js`)

```javascript
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },  // Ramp up to 50 connections
    { duration: '3m', target: 50 },  // Stay at 50 connections
    { duration: '1m', target: 0 },   // Ramp down
  ],
};

export default function () {
  const url = 'ws://localhost:3002/auction';
  const params = { tags: { name: 'AuctionWebSocket' } };

  const response = ws.connect(url, params, function (socket) {
    socket.on('open', function () {
      console.log('WebSocket connection opened');

      // Send auction.start message
      const auctionStart = JSON.stringify({
        type: 'auction.start',
        payload: {
          taker: `0x${Math.random().toString(16).substring(2, 42)}`,
          wager: '1000000000000000000',
          resolver: '0x0000000000000000000000000000000000000000',
          predictedOutcomes: ['0xdeadbeef'],
          takerNonce: Math.floor(Math.random() * 1000),
          chainId: 42161,
        },
      });

      socket.send(auctionStart);
    });

    socket.on('message', function (data) {
      const msg = JSON.parse(data);
      check(msg, {
        'message received': (m) => m.type !== undefined,
      });

      if (msg.type === 'auction.ack') {
        console.log('Received auction.ack:', msg.payload);
      }
    });

    socket.on('error', function (e) {
      if (e.error() !== 'websocket: close sent') {
        console.log('WebSocket error: ', e.error());
      }
    });

    socket.setTimeout(function () {
      socket.close();
    }, 10000); // Keep connection open for 10 seconds
  });

  check(response, { 'status is 101': (r) => r && r.status === 101 });
}
```

### Run k6

```bash
k6 run k6-load-test.js
```

## Method 3: Custom Script (Included)

See the included `load-test.ts` script above - it's the simplest option for quick tests.

## Monitoring During Load Tests

While running load tests, monitor the service:

1. **Metrics Endpoint**: `curl http://localhost:3002/metrics`
   - Watch `relayer_ws_connections_active`
   - Watch `relayer_ws_messages_received_total`
   - Watch `relayer_ws_rate_limit_hits_total`
   - Watch `relayer_ws_errors_total`

2. **Health Endpoint**: `curl http://localhost:3002/health`

3. **Service Logs**: Check console output for errors and warnings

## What to Test

### Connection Limits
- How many concurrent connections can the service handle?
- At what point do connections start failing?

### Message Throughput
- Maximum messages per second the service can process
- How throughput degrades with more connections

### Rate Limiting
- Test the rate limit (default: 100 msg/10s per connection)
- Verify rate limit enforcement works correctly

### Latency
- Measure P50, P95, P99 latency under load
- Identify latency degradation points

### Error Handling
- Test invalid messages
- Test malformed payloads
- Test connection drops

### Memory Usage
- Monitor memory during sustained load
- Check for memory leaks over time

## Example Test Scenarios

### Scenario 1: Gradual Ramp-up
```bash
# Start with 10 connections, gradually increase
pnpm --filter @sapience/relayer run load-test -- --connections 10 --rate 1 --duration 30
pnpm --filter @sapience/relayer run load-test -- --connections 50 --rate 2 --duration 60
pnpm --filter @sapience/relayer run load-test -- --connections 100 --rate 5 --duration 120
```

### Scenario 2: Sustained High Load
```bash
# Maintain high connection count for extended period
pnpm --filter @sapience/relayer run load-test -- --connections 200 --rate 10 --duration 300
```

### Scenario 3: Burst Traffic
```bash
# Simulate traffic spikes
pnpm --filter @sapience/relayer run load-test -- --connections 500 --rate 20 --duration 60
```

## Tips

1. **Start Small**: Begin with low connection counts and gradually increase
2. **Monitor Resources**: Watch CPU, memory, and network usage during tests
3. **Test Rate Limits**: Make sure rate limiting is working as expected
4. **Check Metrics**: Compare metrics before/during/after load tests
5. **Production Testing**: Use lower rates when testing production to avoid impacting real users

## Troubleshooting

### Connections Failing
- Check if service has connection limits
- Verify network/firewall settings
- Check service logs for errors

### High Latency
- Monitor CPU usage (might need more resources)
- Check if rate limiting is causing delays
- Verify message processing logic efficiency

### Memory Issues
- Monitor memory usage over time
- Check for connection leaks (connections not closing properly)
- Verify cleanup of expired auctions/bids

