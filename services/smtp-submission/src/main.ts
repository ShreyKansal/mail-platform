import { readFileSync } from 'node:fs';
import { Redis } from 'ioredis';
import selfsigned from 'selfsigned';
import { z } from 'zod';
import { localSendingIsUnlimited } from '@mp/core';
import { createDatabases } from '@mp/database';
import { startMetricsServer } from '@mp/observability';
import { baseEnv, createLogger, databaseEnv, parseEnv } from '@mp/shared';
import { createSubmissionServer } from './server';

const config = parseEnv(
  baseEnv
    .merge(databaseEnv)
    .extend({
      REDIS_URL: z.string().url(),
      SMTP_HOSTNAME: z.string().default('smtp.mail-platform.test'),
      SMTP_BIND: z.string().default('127.0.0.1'),
      SMTP_STARTTLS_PORT: z.coerce.number().int().default(587),
      SMTP_IMPLICIT_TLS_PORT: z.coerce.number().int().default(465),
      SMTP_TLS_KEY_FILE: z.string().optional(),
      SMTP_TLS_CERT_FILE: z.string().optional(),
      MAX_MESSAGE_BYTES: z.coerce.number().int().default(25 * 1024 * 1024),
      MAX_RECIPIENTS: z.coerce.number().int().default(50),
      METRICS_PORT: z.coerce.number().int().default(9106),
    })
    .refine((c) => c.NODE_ENV !== 'production' || (c.SMTP_TLS_KEY_FILE && c.SMTP_TLS_CERT_FILE), {
      message: 'SMTP_TLS_KEY_FILE and SMTP_TLS_CERT_FILE are required in production',
    }),
);

const log = createLogger('smtp-submission', config.LOG_LEVEL);
const dbs = createDatabases({ appUrl: config.DATABASE_URL, serviceUrl: config.DATABASE_SERVICE_URL, applicationName: 'smtp-submission' });
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });

function tlsMaterial(): { key: string; cert: string } {
  if (config.SMTP_TLS_KEY_FILE && config.SMTP_TLS_CERT_FILE) {
    return { key: readFileSync(config.SMTP_TLS_KEY_FILE, 'utf8'), cert: readFileSync(config.SMTP_TLS_CERT_FILE, 'utf8') };
  }
  log.warn('using a generated self-signed certificate (development only)');
  const pems = selfsigned.generate([{ name: 'commonName', value: config.SMTP_HOSTNAME }], { days: 30, keySize: 2048 });
  return { key: pems.private, cert: pems.cert };
}

const tls = tlsMaterial();
const common = { localUnlimitedSending: localSendingIsUnlimited(config), dbs, redis, log, hostname: config.SMTP_HOSTNAME, tls, maxMessageBytes: config.MAX_MESSAGE_BYTES, maxRecipients: config.MAX_RECIPIENTS };
const starttls = createSubmissionServer({ ...common, secure: false });
const implicit = createSubmissionServer({ ...common, secure: true });
starttls.listen(config.SMTP_STARTTLS_PORT, config.SMTP_BIND, () => log.info({ port: config.SMTP_STARTTLS_PORT }, 'STARTTLS submission listening'));
implicit.listen(config.SMTP_IMPLICIT_TLS_PORT, config.SMTP_BIND, () => log.info({ port: config.SMTP_IMPLICIT_TLS_PORT }, 'implicit TLS submission listening'));
const metricsServer = startMetricsServer(config.METRICS_PORT);

const shutdown = () => {
  log.info('shutting down');
  let pending = 2;
  const done = () => {
    pending -= 1;
    if (pending > 0) return;
    metricsServer.close();
    redis.disconnect();
    void dbs.close().then(() => process.exit(0));
  };
  starttls.close(done);
  implicit.close(done);
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
