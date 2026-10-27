import { z } from 'zod';
import { createServiceDatabase } from '@mp/database';
import { startMetricsServer } from '@mp/observability';
import {
  baseEnv,
  createLogger,
  onShutdown,
  parseEnv,
  runLoop,
  SecretBox,
  serviceDatabaseEnv,
  StaticKeyProvider,
  webhookTargetEnv,
} from '@mp/shared';
import { createSender, WebhookDispatcher } from './dispatcher';

const config = parseEnv(
  baseEnv
    .merge(serviceDatabaseEnv)
    .merge(webhookTargetEnv)
    .extend({
      ENCRYPTION_KEYS: z.string().min(1),
      POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
      METRICS_PORT: z.coerce.number().int().default(9104),
    })
    .refine((c) => c.NODE_ENV !== 'production' || (!c.WEBHOOK_ALLOW_HTTP && !c.WEBHOOK_ALLOW_PRIVATE_NETWORKS), {
      message: 'WEBHOOK_ALLOW_* relaxations are not allowed in production',
    }),
);

const log = createLogger('webhook-dispatcher', config.LOG_LEVEL);
const { db, close } = createServiceDatabase(config.DATABASE_SERVICE_URL, 'webhook-dispatcher', 6);
const dispatcher = new WebhookDispatcher(
  db,
  new SecretBox(new StaticKeyProvider(config.ENCRYPTION_KEYS)),
  createSender({ allowHttp: config.WEBHOOK_ALLOW_HTTP, allowPrivateNetworks: config.WEBHOOK_ALLOW_PRIVATE_NETWORKS }, `${config.PLATFORM_NAME}-Webhooks/1.0`),
  log,
);
const metricsServer = startMetricsServer(config.METRICS_PORT);

let loop: Promise<void> = Promise.resolve();
const signal = onShutdown(log, [
  async () => {
    await loop;
    metricsServer.close();
    await close();
  },
]);
log.info('webhook-dispatcher started');
loop = runLoop({ name: 'webhooks', intervalMs: config.POLL_INTERVAL_MS, logger: log, tick: () => dispatcher.tick() }, signal);
