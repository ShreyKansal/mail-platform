import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { applyDomainChecks, checkDomainRecords, loadDomain, retireDkimKeys } from '@mp/core';
import { createServiceDatabase, sql } from '@mp/database';
import { authoritativeClient, FixtureDnsClient, NodeDnsClient, type VerifyContext } from '@mp/dns-verification';
import { metrics, startMetricsServer } from '@mp/observability';
import { baseEnv, createLogger, mailIdentityEnv, onShutdown, parseEnv, runLoop, serviceDatabaseEnv } from '@mp/shared';

const config = parseEnv(
  baseEnv
    .merge(serviceDatabaseEnv)
    .merge(mailIdentityEnv)
    .extend({
      DNS_SERVERS: z
        .string()
        .default('')
        .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
      DNS_FIXTURE_FILE: z.string().optional(),
      POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
      METRICS_PORT: z.coerce.number().int().default(9105),
    })
    .refine((c) => !(c.NODE_ENV === 'production' && c.DNS_FIXTURE_FILE), { message: 'DNS_FIXTURE_FILE is not allowed in production' }),
);

const log = createLogger('domain-verifier', config.LOG_LEVEL);
const { db, close } = createServiceDatabase(config.DATABASE_SERVICE_URL, 'domain-verifier', 4);
const platform = {
  spfInclude: config.PLATFORM_SPF_INCLUDE.toLowerCase(),
  bounceMxHost: config.PLATFORM_BOUNCE_MX_HOST.toLowerCase(),
  outboundIps: config.PLATFORM_OUTBOUND_IPS,
};
const fixture = config.DNS_FIXTURE_FILE;
const dns = (): VerifyContext =>
  fixture
    ? { platform, dns: new FixtureDnsClient(JSON.parse(readFileSync(fixture, 'utf8'))) }
    : { platform, dns: new NodeDnsClient(config.DNS_SERVERS), authoritative: (h) => authoritativeClient(h) };

/**
 * Scheduled re-verification: pending domains are checked every few minutes,
 * verified ones every 6 hours (DNS drift detection). Claims use a lease so
 * several verifier replicas never check the same domain concurrently.
 */
async function tick(): Promise<number> {
  await db.transaction((tx) => retireDkimKeys(tx));
  const due = await db.execute<{ id: string; org_id: string }>(sql`
    update domains set check_lease_until = now() + interval '5 minutes'
     where id in (
       select id from domains
        where next_check_at <= now() and status <> 'disabled'
          and (check_lease_until is null or check_lease_until < now())
        order by next_check_at
        limit 10
        for update skip locked)
    returning id, org_id`);
  for (const d of due.rows) {
    try {
      const { records } = await loadDomain(db, d.org_id, d.id);
      const checks = await checkDomainRecords(records, dns());
      for (const [purpose, c] of Object.entries(checks)) {
        if (c.status !== 'valid') metrics.dnsVerificationFailures.inc({ purpose, status: c.status });
      }
      const outcome = await db.transaction((tx) => applyDomainChecks(tx, d.org_id, d.id, checks, new Date(), records.find((record) => record.purpose === 'dkim')?.host));
      if (outcome.changed) log.info({ domainId: d.id, status: outcome.status, sendingEnabled: outcome.sendingEnabled }, 'domain status changed');
    } catch (err) {
      log.error({ err, domainId: d.id }, 'domain verification failed');
    }
  }
  return due.rows.length;
}

const metricsServer = startMetricsServer(config.METRICS_PORT);
let loop: Promise<void> = Promise.resolve();
const signal = onShutdown(log, [
  async () => {
    await loop;
    metricsServer.close();
    await close();
  },
]);
log.info({ fixture: !!fixture }, 'domain-verifier started');
loop = runLoop({ name: 'verify', intervalMs: config.POLL_INTERVAL_MS, logger: log, tick }, signal);
