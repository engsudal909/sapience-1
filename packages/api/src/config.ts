import { cleanEnv, str } from 'envalid';
import { config as dotEnvConfig } from 'dotenv';
import { fromRoot } from './utils/fromRoot';

dotEnvConfig({ path: fromRoot('.env') });

/**
 * Define all API environment variables here. By avoiding direct process.env access elsewhere,
 * we keep configuration centralized and make required variables easy to audit.
 */
export const config = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'production', 'staging', 'test'],
    default: 'development',
  }),
});
