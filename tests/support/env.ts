import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const POSTFIX_LOG = resolve(ROOT, '.data/postfix-log/maillog');

const db = (user: string, pass: string) => `postgres://${user}:${pass}@127.0.0.1:5432/mail_platform_test`;

export const TEST_DB = {
  owner: db('mp_owner', process.env.POSTGRES_OWNER_PASSWORD ?? 'mp_owner_dev'),
  app: db('mp_app', process.env.MP_APP_PASSWORD ?? 'mp_app_dev'),
  service: db('mp_service', process.env.MP_SERVICE_PASSWORD ?? 'mp_service_dev'),
};

/**
 * Test-only secrets. They are fixed (not random per file) because every suite
 * shares the test database and Postfix queue: mail left queued by one file is
 * dispatched by the next, which must be able to decrypt its DKIM keys.
 */
export const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  DATABASE_URL: TEST_DB.app,
  DATABASE_SERVICE_URL: TEST_DB.service,
  REDIS_URL: 'redis://127.0.0.1:6379/1',
  ENCRYPTION_KEYS: `test:${Buffer.alloc(32, 7).toString('base64')}`,
  VERP_SECRET: 'test-only-verp-secret-not-for-production-use',
  PLATFORM_BOUNCE_DOMAIN: 'bounces.mail-platform.test',
  PLATFORM_BOUNCE_MX_HOST: 'feedback.mail-platform.test',
  PLATFORM_SPF_INCLUDE: '_spf.mail-platform.test',
  MTA_HOST: '127.0.0.1',
  MTA_PORT: '10025',
  COOKIE_SECURE: 'false',
  ALLOW_PUBLIC_SIGNUP: 'true',
  WEBHOOK_ALLOW_HTTP: 'true',
  WEBHOOK_ALLOW_PRIVATE_NETWORKS: 'true',
  RATE_LIMIT_PER_SECOND: '1000',
  DASHBOARD_ORIGIN: 'http://localhost:5173',
};

export const MAILPIT = 'http://127.0.0.1:8025';
