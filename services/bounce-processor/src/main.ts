import { z } from 'zod';
import { createServiceDatabase } from '@mp/database';
import { startMetricsServer } from '@mp/observability';
import { baseEnv, createLogger, parseEnv, serviceDatabaseEnv } from '@mp/shared';
import { createBounceServer } from './server';

const config = parseEnv(
  baseEnv.merge(serviceDatabaseEnv).extend({
    VERP_SECRET: z.string().min(32),
    BOUNCE_HOST: z.string().default('127.0.0.1'),
    BOUNCE_PORT: z.coerce.number().int().default(2525),
    BOUNCE_HOSTNAME: z.string().default('feedback.mail-platform.test'),
    MAX_MESSAGE_BYTES: z.coerce.number().int().default(5 * 1024 * 1024),
    METRICS_PORT: z.coerce.number().int().default(9103),
  }),
);

const log = createLogger('bounce-processor', config.LOG_LEVEL);
const { db, close } = createServiceDatabase(config.DATABASE_SERVICE_URL, 'bounce-processor', 4);
const server = createBounceServer({ db, log, verpSecret: config.VERP_SECRET, hostname: config.BOUNCE_HOSTNAME, maxMessageBytes: config.MAX_MESSAGE_BYTES });
const metricsServer = startMetricsServer(config.METRICS_PORT);
server.listen(config.BOUNCE_PORT, config.BOUNCE_HOST, () => log.info({ port: config.BOUNCE_PORT }, 'bounce-processor listening'));

const shutdown = () => {
  log.info('shutting down');
  server.close(() => {
    metricsServer.close();
    void close().then(() => process.exit(0));
  });
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
