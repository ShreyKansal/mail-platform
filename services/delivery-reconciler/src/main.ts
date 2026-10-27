import { z } from 'zod';
import { createServiceDatabase } from '@mp/database';
import { startMetricsServer } from '@mp/observability';
import { baseEnv, createLogger, onShutdown, parseEnv, runLoop, serviceDatabaseEnv } from '@mp/shared';
import { PostfixLogReconciler } from './reconciler';

const config = parseEnv(
  baseEnv.merge(serviceDatabaseEnv).extend({
    VERP_SECRET: z.string().min(32),
    POSTFIX_LOG_PATH: z.string().min(1),
    POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
    METRICS_PORT: z.coerce.number().int().default(9102),
  }),
);

// Exactly one reconciler may run per Postfix log file (single consumer by design).
const log = createLogger('delivery-reconciler', config.LOG_LEVEL);
const { db, close } = createServiceDatabase(config.DATABASE_SERVICE_URL, 'delivery-reconciler', 4);
const reconciler = new PostfixLogReconciler(db, { logPath: config.POSTFIX_LOG_PATH, verpSecret: config.VERP_SECRET }, log);
const metricsServer = startMetricsServer(config.METRICS_PORT);

let loop: Promise<void> = Promise.resolve();
const signal = onShutdown(log, [
  async () => {
    await loop;
    metricsServer.close();
    await close();
  },
]);
log.info({ path: config.POSTFIX_LOG_PATH }, 'delivery-reconciler started');
loop = runLoop({ name: 'postfix-log', intervalMs: config.POLL_INTERVAL_MS, logger: log, tick: () => reconciler.tick() }, signal);
