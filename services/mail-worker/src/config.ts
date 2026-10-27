import { hostname } from 'node:os';
import { z } from 'zod';
import { baseEnv, mailIdentityEnv, parseEnv, secretsEnv, serviceDatabaseEnv } from '@mp/shared';

export const workerEnv = baseEnv
  .merge(serviceDatabaseEnv)
  .merge(secretsEnv)
  .merge(mailIdentityEnv)
  .extend({
    WORKER_ID: z.string().default(`${hostname()}-${process.pid}`),
    /** Streams this worker serves; run separate pools so marketing never starves transactional mail. */
    WORKER_STREAMS: z
      .string()
      .default('transactional,marketing')
      .transform((s) => s.split(',').map((x) => x.trim()))
      .pipe(z.array(z.enum(['transactional', 'marketing'])).min(1)),
    BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    MTA_CONNECTIONS: z.coerce.number().int().min(1).max(100).default(5),
    LEASE_SECONDS: z.coerce.number().int().min(30).default(120),
    MAX_SUBMISSION_ATTEMPTS: z.coerce.number().int().min(1).default(8),
    /** How far the Postfix log watermark must pass a lease expiry before re-dispatch is considered safe. */
    RECONCILE_GRACE_SECONDS: z.coerce.number().int().min(10).default(60),
    POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(500),
    METRICS_PORT: z.coerce.number().int().default(9101),
  });

export type WorkerConfig = z.infer<typeof workerEnv>;
export const loadConfig = (): WorkerConfig => parseEnv(workerEnv);
