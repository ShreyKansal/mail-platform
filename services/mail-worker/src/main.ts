import { createCoreConfig, ExportWorker, BroadcastWorker, AutomationWorker } from '@mp/core';
import { createServiceDatabase } from '@mp/database';
import { startMetricsServer } from '@mp/observability';
import { createLogger, onShutdown, runLoop } from '@mp/shared';
import { loadConfig } from './config';
import { Dispatcher } from './dispatcher';
import { createMtaClient } from './mta';

const config = loadConfig();
const log = createLogger('mail-worker', config.LOG_LEVEL);
const { db, close } = createServiceDatabase(config.DATABASE_SERVICE_URL, 'mail-worker');
const exportsWorker = new ExportWorker(db, log);
const broadcastWorker = new BroadcastWorker(db, createCoreConfig(config), log);
const automationWorker = new AutomationWorker(db, createCoreConfig(config), log);
const mta = createMtaClient({ host: config.MTA_HOST, port: config.MTA_PORT, connections: config.MTA_CONNECTIONS });
const enforcedTlsMta = createMtaClient({ host: config.MTA_HOST, port: config.MTA_ENFORCED_TLS_PORT, connections: config.MTA_CONNECTIONS });
const dispatcher = new Dispatcher(
  db,
  createCoreConfig(config),
  mta,
  {
    workerId: config.WORKER_ID,
    streams: config.WORKER_STREAMS,
    batchSize: config.BATCH_SIZE,
    leaseSeconds: config.LEASE_SECONDS,
    maxSubmissionAttempts: config.MAX_SUBMISSION_ATTEMPTS,
    reconcileGraceSeconds: config.RECONCILE_GRACE_SECONDS,
  },
  log,
  enforcedTlsMta,
);

const metricsServer = startMetricsServer(config.METRICS_PORT);
const loops: Promise<void>[] = [];
const signal = onShutdown(log, [
  async () => {
    // Let the in-flight batch finish so leases are released or committed.
    await Promise.all(loops);
    mta.close();
    enforcedTlsMta.close();
    metricsServer.close();
    await close();
  },
]);

log.info({ workerId: config.WORKER_ID, streams: config.WORKER_STREAMS, mta: `${config.MTA_HOST}:${config.MTA_PORT}` }, 'mail-worker started');
loops.push(runLoop({ name: 'dispatch', intervalMs: config.POLL_INTERVAL_MS, logger: log, tick: () => dispatcher.tick() }, signal));
loops.push(runLoop({ name: 'reconcile-uncertain', intervalMs: 15_000, logger: log, tick: async () => (await dispatcher.reconcileUncertain(), 0) }, signal));
loops.push(runLoop({ name: 'queue-metrics', intervalMs: 15_000, logger: log, tick: async () => (await dispatcher.reportQueueMetrics(), 0) }, signal));
// Returns >0 while there is a backlog, so large backlogs drain without waiting for the interval.
loops.push(runLoop({ name: 'idempotency-gc', intervalMs: 10 * 60_000, logger: log, tick: () => dispatcher.purgeExpiredIdempotencyKeys() }, signal));
loops.push(runLoop({ name: 'operational-gc', intervalMs: 10 * 60_000, logger: log, tick: () => dispatcher.purgeOperationalData() }, signal));
loops.push(runLoop({ name: 'exports', intervalMs: 1000, logger: log, tick: () => exportsWorker.tick() }, signal));
loops.push(runLoop({ name: 'export-gc', intervalMs: 10 * 60_000, logger: log, tick: () => exportsWorker.purge() }, signal));
if (config.WORKER_STREAMS.includes('marketing')) loops.push(runLoop({ name: 'broadcasts', intervalMs: 1000, logger: log, tick: () => broadcastWorker.tick() }, signal));

if (config.WORKER_STREAMS.includes('marketing')) loops.push(runLoop({ name: 'automations', intervalMs: 1000, logger: log, tick: () => automationWorker.tick() }, signal));
