import * as Sentry from '@sentry/node';
import { config } from './config';

import type { WebSocketServer } from 'ws';

if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    sendDefaultPii: true,
    _experiments: {
      enableMetrics: config.SENTRY_ENABLE_METRICS,
    },
  });

  console.log('Sentry initialized');
}

export { Sentry };

export function createSentryGauge(name: string) {
  let count = 0;

  return {
    increment: () => {
      count++;
      Sentry.metrics.gauge(name, count);
    },
    decrement: () => {
      count--;
      Sentry.metrics.gauge(name, count);
    },
  };
}
