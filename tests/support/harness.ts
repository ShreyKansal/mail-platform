import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { Redis } from 'ioredis';
import { buildApp } from '@mp/api/app';
import { apiEnv } from '@mp/api/config';
import { createBounceServer } from '@mp/bounce-processor/server';
import { createCoreConfig, type CoreConfig } from '@mp/core';
import { createDatabases, emailRecipients, eq, organizations, type Databases } from '@mp/database';
import { PostfixLogReconciler } from '@mp/delivery-reconciler/reconciler';
import { FixtureDnsClient, type MxRecord, type VerifyContext } from '@mp/dns-verification';
import { Dispatcher } from '@mp/mail-worker/dispatcher';
import { createMtaClient, type MtaClient } from '@mp/mail-worker/mta';
import { createLogger } from '@mp/shared';
import { createSender, WebhookDispatcher } from '@mp/webhook-dispatcher/dispatcher';
import { POSTFIX_LOG, testEnv } from './env';

export type Zone = Record<string, { TXT?: string[]; MX?: MxRecord[] }>;

export interface ReceivedWebhook {
  headers: IncomingMessage['headers'];
  body: string;
}

export interface Harness {
  app: FastifyInstance;
  dbs: Databases;
  redis: Redis;
  core: CoreConfig;
  config: ReturnType<typeof apiEnv.parse>;
  zone: Zone;
  dispatcher: Dispatcher;
  reconciler: PostfixLogReconciler;
  webhooks: WebhookDispatcher;
  webhookReceiver: { url: string; received: ReceivedWebhook[]; respondWith: number };
  /** Runs every worker loop once. */
  pumpOnce(): Promise<void>;
  /** Pumps until `check` returns a truthy value or the timeout expires. */
  pumpUntil<T>(check: () => Promise<T | null | undefined | false>, timeoutMs?: number): Promise<T>;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function createHarness(overrides: Record<string, string> = {}): Promise<Harness> {
  const config = apiEnv.parse({ ...testEnv, ...overrides });
  const dbs = createDatabases({ appUrl: config.DATABASE_URL, serviceUrl: config.DATABASE_SERVICE_URL, applicationName: 'tests' });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
  await redis.flushdb();
  const core = createCoreConfig(config);
  const zone: Zone = {};
  const dns: VerifyContext = {
    platform: core.platform,
    dns: { txt: (n) => new FixtureDnsClient(zone).txt(n), mx: (n) => new FixtureDnsClient(zone).mx(n), raw: (n, t) => new FixtureDnsClient(zone).raw(n, t) },
  };
  const log = createLogger('tests', 'warn');
  const app = await buildApp({ config, dbs, redis, core, dns }, { logger: false });

  const mta: MtaClient = createMtaClient({ host: config.MTA_HOST, port: config.MTA_PORT, connections: 2 });
  const enforcedTlsMta = createMtaClient({ host: config.MTA_HOST, port: config.MTA_ENFORCED_TLS_PORT, connections: 2 });
  const dispatcher = new Dispatcher(
    dbs.service,
    core,
    mta,
    { workerId: `test-${randomBytes(3).toString('hex')}`, streams: ['transactional'], batchSize: 50, leaseSeconds: 60, maxSubmissionAttempts: 3, reconcileGraceSeconds: 10 },
    log,
    enforcedTlsMta,
  );
  const reconciler = new PostfixLogReconciler(dbs.service, { logPath: POSTFIX_LOG, verpSecret: config.VERP_SECRET }, log);
  const webhooks = new WebhookDispatcher(dbs.service, core.secrets, createSender({ allowHttp: true, allowPrivateNetworks: true }, 'tests'), log);

  // Bounce server on the port Postfix routes VERP DSNs to (host.docker.internal:2525).
  const bounceServer = createBounceServer({ db: dbs.service, log, verpSecret: config.VERP_SECRET, hostname: 'feedback.test', maxMessageBytes: 5_000_000 });
  // Docker Desktop forwards host.docker.internal to loopback; Linux CI needs the bridge interface (TEST_BOUNCE_BIND=0.0.0.0).
  await new Promise<void>((r) => bounceServer.listen(2525, process.env.TEST_BOUNCE_BIND ?? '127.0.0.1', () => r()));

  // Local webhook receiver.
  const receiver = { url: '', received: [] as ReceivedWebhook[], respondWith: 200 };
  const httpServer: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      receiver.received.push({ headers: req.headers, body });
      res.statusCode = receiver.respondWith;
      res.end('ok');
    });
  });
  await new Promise<void>((r) => httpServer.listen(0, '127.0.0.1', () => r()));
  receiver.url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/hooks`;

  const pumpOnce = async () => {
    await dispatcher.tick();
    await reconciler.tick();
    await dispatcher.reconcileUncertain();
    await webhooks.tick();
  };

  return {
    app,
    dbs,
    redis,
    core,
    config,
    zone,
    dispatcher,
    reconciler,
    webhooks,
    webhookReceiver: receiver,
    pumpOnce,
    async pumpUntil(check, timeoutMs = 60_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        await pumpOnce();
        const v = await check();
        if (v) return v;
        if (Date.now() > deadline) throw new Error('pumpUntil timed out');
        await sleep(400);
      }
    },
    async close() {
      await app.close();
      mta.close();
      enforcedTlsMta.close();
      await new Promise<void>((r) => bounceServer.close(() => r()));
      await new Promise<void>((r) => httpServer.close(() => r()));
      redis.disconnect();
      await dbs.close();
    },
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export interface Account {
  cookie: string;
  orgId: string;
  apiKey: string;
}

const cookieOf = (res: LightMyRequestResponse) => {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? '').split(';')[0]!;
};

export function sessionHeaders(cookie: string) {
  return { cookie, 'x-mp-csrf': '1', origin: 'http://localhost:5173' };
}

/** Signs up, lifts sandbox limits (as an admin approval would) and creates a full-access API key. */
export async function createAccount(h: Harness, label = randomBytes(4).toString('hex'), opts: { liftLimits?: boolean } = {}): Promise<Account> {
  const signup = await h.app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { name: `User ${label}`, email: `owner-${label}@example.org`, password: 'correct horse battery staple', organization_name: `Org ${label}` },
  });
  if (signup.statusCode !== 201) throw new Error(`signup failed: ${signup.body}`);
  const cookie = cookieOf(signup);
  const session = await h.app.inject({ method: 'GET', url: '/auth/session', headers: { cookie } });
  const orgId = session.json().organization.id as string;
  if (opts.liftLimits !== false) {
    await h.dbs.service.update(organizations).set({ dailyRecipientLimit: 10_000, perMinuteRecipientLimit: 1_000 }).where(eq(organizations.id, orgId));
  }
  const key = await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: sessionHeaders(cookie), payload: { name: 'test', scope: 'full_access' } });
  if (key.statusCode !== 201) throw new Error(`api key creation failed: ${key.body}`);
  return { cookie, orgId, apiKey: key.json().token as string };
}

export const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

/** Adds a domain via the API, publishes its records in the fixture zone and verifies it. */
export async function addVerifiedDomain(h: Harness, account: Account, name: string, opts: { dmarc?: string } = {}) {
  const created = await h.app.inject({ method: 'POST', url: '/v1/domains', headers: bearer(account.apiKey), payload: { name } });
  if (created.statusCode !== 201) throw new Error(`domain creation failed: ${created.body}`);
  const domain = created.json();
  publishRecords(h, domain.records, opts);
  const verified = await h.app.inject({ method: 'POST', url: `/v1/domains/${domain.id}/verify`, headers: bearer(account.apiKey) });
  if (verified.statusCode !== 200) throw new Error(`verify failed: ${verified.body}`);
  return verified.json();
}

export function publishRecords(
  h: Harness,
  records: Array<{ purpose: string; type: string; host: string; value: string; priority: number | null }>,
  opts: { dmarc?: string; only?: string[] } = {},
) {
  for (const r of records) {
    if (opts.only && !opts.only.includes(r.purpose)) continue;
    const entry = (h.zone[r.host] ??= {});
    if (r.type === 'MX') entry.MX = [{ exchange: r.value, priority: r.priority ?? 10 }];
    else if (r.purpose === 'dmarc') entry.TXT = [opts.dmarc ?? 'v=DMARC1; p=reject'];
    else entry.TXT = [...(entry.TXT ?? []), r.value];
  }
}

export async function recipientStates(h: Harness, emailId: string) {
  const rows = await h.dbs.service
    .select({ address: emailRecipients.address, state: emailRecipients.state, bounceClass: emailRecipients.bounceClass })
    .from(emailRecipients)
    .where(eq(emailRecipients.emailId, emailId));
  return Object.fromEntries(rows.map((r) => [r.address, r]));
}
