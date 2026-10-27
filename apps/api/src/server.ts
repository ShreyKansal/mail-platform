import { Redis } from 'ioredis';
import { createCoreConfig } from '@mp/core';
import { createDatabases } from '@mp/database';
import { startMetricsServer } from '@mp/observability';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDnsContext } from './dns';

const config = loadConfig();
const dbs = createDatabases({ appUrl: config.DATABASE_URL, serviceUrl: config.DATABASE_SERVICE_URL, applicationName: 'api' });
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
const core = createCoreConfig(config);
const dns = createDnsContext(core, { servers: config.DNS_SERVERS, fixtureFile: config.DNS_FIXTURE_FILE });

const app = await buildApp({ config, dbs, redis, core, dns });
const metricsServer = startMetricsServer(config.METRICS_PORT);

let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  await app.close(); // stops accepting, drains in-flight requests
  metricsServer.close();
  redis.disconnect();
  await dbs.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
