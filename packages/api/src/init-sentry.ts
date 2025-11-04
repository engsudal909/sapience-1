import * as Sentry from '@sentry/node';
import { config } from './config';

if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    tracesSampleRate: 1.0,
  });
} else {
  console.log('Sentry disabled in development mode');
}
