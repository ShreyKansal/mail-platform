import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Redis } from 'ioredis';
import { createCoreConfig } from '@mp/core';
import type { Databases } from '@mp/database';
import { buildApp } from './app';
import { apiEnv } from './config';

/**
 * Writes the OpenAPI 3.1 document generated from the route schemas to
 * docs/api/openapi.json. No database or Redis connection is opened.
 */
const config = apiEnv.parse({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://unused@localhost/unused',
  DATABASE_SERVICE_URL: 'postgres://unused@localhost/unused',
  REDIS_URL: 'redis://localhost:6379',
  ENCRYPTION_KEYS: `doc:${Buffer.alloc(32).toString('base64')}`,
  VERP_SECRET: 'x'.repeat(32),
  PLATFORM_BOUNCE_DOMAIN: 'bounces.mail-platform.example',
  PLATFORM_BOUNCE_MX_HOST: 'feedback.mail-platform.example',
  PLATFORM_SPF_INCLUDE: '_spf.mail-platform.example',
  PUBLIC_API_URL: 'https://api.mail-platform.example',
});
const core = createCoreConfig(config);
const app = await buildApp(
  {
    config,
    core,
    dbs: {} as Databases,
    redis: {} as Redis,
    dns: { platform: core.platform, dns: { txt: async () => ({ ok: true, records: [] }), mx: async () => ({ ok: true, records: [] }), raw: async () => [] } },
  },
  { logger: false },
);
await app.ready();
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/api/openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(app.swagger(), null, 2)}\n`);
console.log(`wrote ${out}`);
await app.close();
