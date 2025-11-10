import * as Sentry from '@sentry/node';
import { config } from './config';

Sentry.init({
  dsn: config.SENTRY_DSN,
  debug: config.SENTRY_DEBUG,
  environment: config.NODE_ENV,
  sendDefaultPii: true,
  _experiments: {
    enableMetrics: config.SENTRY_ENABLE_METRICS,
  },
});

if (config.SENTRY_DSN) {
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
