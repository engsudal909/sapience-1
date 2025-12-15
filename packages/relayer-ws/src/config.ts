import { cleanEnv, str, bool, num } from 'envalid';
import { config as dotEnvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fromRoot(relativePath: string): string {
  // Go up from packages/auction/src to repo root
  const repoRoot = resolve(__dirname, '../../..');
  return resolve(repoRoot, relativePath);
}

dotEnvConfig({ path: fromRoot('.env') });

export const config = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'production', 'test'],
    default: 'development',
  }),
  PORT: str({ default: '3002' }),
  ENABLE_AUCTION_WS: bool({ default: true }),
  SENTRY_DSN: str({ default: '' }),
  RATE_LIMIT_WINDOW_MS: num({ default: 10_000 }),
  RATE_LIMIT_MAX_MESSAGES: num({ default: 100 }),
});

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';

