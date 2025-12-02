import { cleanEnv, str, num, bool } from 'envalid';
import { config as dotEnvConfig } from 'dotenv';
import { fromRoot } from './utils/fromRoot';
import { originsArray } from './utils/configTypes';

dotEnvConfig({ path: fromRoot('.env') });

/**
 * Define all API environment variables here. By avoiding direct process.env access elsewhere,
 * we keep configuration centralized and make required variables easy to audit.
 */
export const config = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'production', 'test'],
    default: 'development',
  }),
  PORT: num({ default: 3001 }),
  CHAT_ALLOWED_ORIGINS: originsArray({
    default: [],
    desc: 'Comma-separated list of Origins (scheme + host + optional port) allowed to open chat websockets. E.g.: https://www.domain.xyz,https://domain.xyz',
  }),
  SENTRY_DSN: str({
    default: '',
    desc: 'Sentry endpoint that should be used. E.g.: https://<sentry-public-key>.ingest.us.sentry.io/<sentry-project>',
  }),
  SENTRY_ENABLE_METRICS: bool({ default: true }),
  SENTRY_DEBUG: bool({ default: false }),
  ENABLE_AUCTION_WS: bool({ default: true }),
});
