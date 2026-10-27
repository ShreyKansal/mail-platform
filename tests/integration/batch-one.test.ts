import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, dkimKeys, emailEvents, emailRecipients, emails, eq, exportChunks, exportJobs, notifications, organizationMembers, webhookDeliveries, webhookEndpoints, withTenant } from '@mp/database';
import { applyDomainChecks, checkDomainRecords, DKIM_OVERLAP_MS, ExportWorker, loadDomain, loadSendingIdentity, retireDkimKeys, signWebhook } from '@mp/core';
import { FixtureDnsClient } from '@mp/dns-verification';
import { Dispatcher } from '@mp/mail-worker/dispatcher';
import { WebhookDispatcher } from '@mp/webhook-dispatcher/dispatcher';
import { createLogger } from '@mp/shared';
import { addVerifiedDomain, bearer, createAccount, createHarness, recipientStates, sessionHeaders, type Account, type Harness } from '../support/harness';

let h: Harness, account: Account, other: Account;
let domainId: string, projectId: string;
const run = randomUUID().slice(0, 8);
const domain = `batch-${run}.test`;
const log = createLogger('batch-tests', 'silent');
const send = (extra: Record<string, unknown> = {}) => h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(account.apiKey), payload: {
  from: `sender@${domain}`, to: 'success@simulate.mail-platform.invalid', subject: `batch ${run}`, text: 'simulation', test_mode: true, ...extra,
} });
beforeAll(async () => {
  h = await createHarness(); account = await createAccount(h, `batch-${run}`); other = await createAccount(h, `batch-other-${run}`);
  domainId = (await addVerifiedDomain(h, account, domain)).id;
  projectId = (await h.app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: account.cookie } })).json().project.id;
  // Suites share a worker queue. Finish real SMTP admissions left by earlier suites
  // before installing the simulator's no-network spy.
  await h.dispatcher.tick();
});
afterAll(async () => h?.close());

describe('background CSV exports', () => {
  it('checkpoints more than 1000 rows, resumes an expired lease and streams an isolated CSV', async () => {
    const prefix = `export-${run}`;
    const values = Array.from({ length: 1201 }, (_, i) => ({ orgId: account.orgId, projectId, domainId, source: 'api' as const,
      fromAddress: `sender@${domain}`, subject: `${prefix}-${i}`, messageId: randomUUID(), recipientCount: 0,
      createdAt: new Date(Date.now() - 10_000) }));
    await h.dbs.service.insert(emails).values(values);
    const queued = await h.app.inject({ method: 'POST', url: '/v1/exports', headers: sessionHeaders(account.cookie), payload: { filters: { search: prefix } } });
    expect(queued.statusCode).toBe(202); const id = queued.json().id;
    const download = () => h.app.inject({ method: 'GET', url: `/v1/exports/${id}/download`, headers: sessionHeaders(account.cookie) });
    expect((await download()).statusCode).toBe(409);
    expect((await h.app.inject({ method: 'GET', url: `/v1/exports/${id}`, headers: sessionHeaders(other.cookie) })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'GET', url: `/v1/exports/${id}/download`, headers: bearer(account.apiKey) })).statusCode).toBe(403);
    expect(await withTenant(h.dbs.app, other.orgId, tx => tx.select().from(exportJobs).where(eq(exportJobs.id, id)))).toHaveLength(0);
    await new ExportWorker(h.dbs.service).tick();
    const [checkpoint] = await h.dbs.service.select().from(exportJobs).where(eq(exportJobs.id, id));
    expect(checkpoint).toMatchObject({ status: 'queued', rowCount: 500, chunkCount: 1 });
    // A crash after claim is reclaimed, while the committed checkpoint survives a worker restart.
    await h.dbs.service.update(exportJobs).set({ status: 'running', leaseToken: randomUUID(), leaseUntil: new Date(0) }).where(eq(exportJobs.id, id));
    await h.dbs.service.insert(emails).values({ ...values[0]!, messageId: randomUUID(), subject: `${prefix}-too-late`, createdAt: new Date(Date.now() + 1000) });
    const restarted = new ExportWorker(h.dbs.service); await restarted.tick(); await restarted.tick();
    const [ready] = await h.dbs.service.select().from(exportJobs).where(eq(exportJobs.id, id));
    expect(ready).toMatchObject({ status: 'ready', rowCount: 1201, chunkCount: 3 });
    const csv = await download(); expect(csv.statusCode).toBe(200);
    const lines = csv.body.trim().split('\r\n'); expect(lines).toHaveLength(1202);
    expect(new Set(lines.slice(1).map(line => line.split(',')[0])).size).toBe(1201);
    expect(csv.body).not.toContain('too-late');
    expect(await withTenant(h.dbs.app, other.orgId, tx => tx.select().from(exportChunks).where(eq(exportChunks.jobId, id)))).toHaveLength(0);
    await h.dbs.service.update(exportJobs).set({ expiresAt: new Date(0) }).where(eq(exportJobs.id, id));
    expect((await download()).statusCode).toBe(404); await restarted.purge();
    expect(await h.dbs.service.select().from(exportChunks).where(eq(exportChunks.jobId, id))).toHaveLength(0);
  });
  it('enforces the active-job cap and admin-session permission', async () => {
    const queue = (headers = sessionHeaders(account.cookie)) => h.app.inject({ method: 'POST', url: '/v1/exports', headers, payload: { filters: {} } });
    for (let i = 0; i < 5; i++) expect((await queue()).statusCode).toBe(202);
    expect((await queue()).statusCode).toBe(429);
    await h.dbs.service.update(organizationMembers).set({ role: 'read_only' }).where(eq(organizationMembers.orgId, account.orgId));
    try {
      expect((await queue()).statusCode).toBe(403);
      expect((await h.app.inject({ method: 'GET', url: '/v1/exports', headers: sessionHeaders(account.cookie) })).statusCode).toBe(403);
    } finally {
      await h.dbs.service.update(organizationMembers).set({ role: 'owner' }).where(eq(organizationMembers.orgId, account.orgId));
      await h.dbs.service.delete(exportJobs).where(and(eq(exportJobs.orgId, account.orgId), eq(exportJobs.status, 'queued')));
    }
  });
});

describe('DKIM rotation', () => {
  it('keeps signing with the old key until DNS verifies, then overlaps for seven days', async () => {
    const old = await loadSendingIdentity(h.dbs.service, h.core, domainId);
    const snapshot = await loadDomain(h.dbs.service, account.orgId, domainId);
    const checks = await checkDomainRecords(snapshot.records, { platform: h.core.platform, dns: new FixtureDnsClient(h.zone) });
    const path = `/v1/domains/${domainId}/dkim-keys`;
    const created = await h.app.inject({ method: 'POST', url: path, headers: bearer(account.apiKey) });
    expect(created.statusCode).toBe(201); const key = created.json();
    expect(JSON.stringify(key)).not.toContain('private');
    expect((await h.app.inject({ method: 'POST', url: path, headers: bearer(account.apiKey) })).statusCode).toBe(409);
    expect((await h.app.inject({ method: 'GET', url: path, headers: bearer(other.apiKey) })).statusCode).toBe(404);
    const verify = () => h.app.inject({ method: 'POST', url: `${path}/${key.id}/verify`, headers: bearer(account.apiKey) });
    expect((await verify()).json().activated).toBe(false);
    expect((await loadSendingIdentity(h.dbs.service, h.core, domainId)).dkim.selector).toBe(old.dkim.selector);
    h.zone[key.record.host] = { TXT: [key.record.value] };
    expect((await verify()).json().activated).toBe(true);
    expect((await loadSendingIdentity(h.dbs.service, h.core, domainId)).dkim.selector).toBe(key.selector);
    await expect(h.dbs.service.transaction(tx => applyDomainChecks(tx, account.orgId, domainId, checks, new Date(), `${old.dkim.selector}._domainkey.${domain}`))).rejects.toMatchObject({ code: 'conflict' });
    const [retiring] = await h.dbs.service.select().from(dkimKeys).where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'retiring')));
    expect(retiring!.selector).toBe(old.dkim.selector);
    expect(Math.abs(retiring!.retireAfter!.getTime() - Date.now() - DKIM_OVERLAP_MS)).toBeLessThan(5000);
    expect(h.zone[`${old.dkim.selector}._domainkey.${domain}`]?.TXT?.length).toBeGreaterThan(0);
    await h.dbs.service.transaction(tx => retireDkimKeys(tx, new Date(retiring!.retireAfter!.getTime() - 1)));
    expect((await h.dbs.service.select().from(dkimKeys).where(eq(dkimKeys.id, retiring!.id)))[0]!.status).toBe('retiring');
    await h.dbs.service.transaction(tx => retireDkimKeys(tx, retiring!.retireAfter!));
    expect((await h.dbs.service.select().from(dkimKeys).where(eq(dkimKeys.id, retiring!.id)))[0]!.status).toBe('retired');
    const next = (await h.app.inject({ method: 'POST', url: path, headers: bearer(account.apiKey) })).json();
    expect((await h.app.inject({ method: 'DELETE', url: `${path}/${next.id}`, headers: bearer(account.apiKey) })).statusCode).toBe(200);
    expect((await loadSendingIdentity(h.dbs.service, h.core, domainId)).dkim.selector).toBe(key.selector);
  });
});

describe('deterministic delivery', () => {
  it('rejects real destinations and reserved addresses in live mode', async () => {
    expect((await send({ to: 'person@example.org' })).statusCode).toBe(422);
    expect((await send({ test_mode: false })).statusCode).toBe(422);
    expect((await send({ to: 'unknown@simulate.mail-platform.invalid' })).statusCode).toBe(422);
    expect((await send({ bcc: ['person@example.org'] })).statusCode).toBe(422);
    expect((await send({ attachments: [{ filename: 'a.txt', path: 'https://example.org/a.txt' }] })).statusCode).toBe(422);
  });
  it('runs all scenarios without an MTA handoff and labels events and filters', async () => {
    const accepted = await send({ to: ['success', 'defer', 'bounce', 'suppress'].map(s => `${s}@simulate.mail-platform.invalid`) });
    expect(accepted.statusCode).toBe(202); const id = accepted.json().id;
    const submit = vi.fn(async () => { throw new Error('simulation must never submit'); });
    const worker = new Dispatcher(h.dbs.service, h.core, { submit, close() {} }, { workerId: 'batch-sim', streams: ['transactional'], batchSize: 50, leaseSeconds: 60, maxSubmissionAttempts: 3, reconcileGraceSeconds: 10 }, log);
    await worker.tick();
    const states = await recipientStates(h, id);
    expect(states['success@simulate.mail-platform.invalid']!.state).toBe('REMOTE_ACCEPTED');
    expect(states['defer@simulate.mail-platform.invalid']!.state).toBe('DEFERRED');
    expect(states['bounce@simulate.mail-platform.invalid']!.state).toBe('BOUNCED');
    expect(states['suppress@simulate.mail-platform.invalid']!.state).toBe('SUPPRESSED');
    await worker.tick(); expect((await recipientStates(h, id))['defer@simulate.mail-platform.invalid']!.state).toBe('REMOTE_ACCEPTED');
    expect(submit).not.toHaveBeenCalled();
    const events = await h.dbs.service.select().from(emailEvents).where(eq(emailEvents.emailId, id));
    expect(events.length).toBeGreaterThan(4); expect(events.every(e => e.data.test_mode === true)).toBe(true);
    const listed = (await h.app.inject({ method: 'GET', url: `/v1/emails?test_mode=true&search=batch%20${run}`, headers: bearer(account.apiKey) })).json();
    expect(listed.data.some((e: { id: string; test_mode: boolean }) => e.id === id && e.test_mode)).toBe(true);
    expect((await h.app.inject({ method: 'GET', url: `/v1/emails/${id}`, headers: bearer(other.apiKey) })).statusCode).toBe(404);
  });
  it('recovers a crashed simulation lease without consulting Postfix logs', async () => {
    const id = (await send()).json().id;
    await h.dbs.service.update(emailRecipients).set({ state: 'DISPATCHING', leaseOwner: 'dead-worker', leaseExpiresAt: new Date(0) }).where(eq(emailRecipients.emailId, id));
    const submit = vi.fn(async () => { throw new Error('unexpected MTA'); });
    const worker = new Dispatcher(h.dbs.service, h.core, { submit, close() {} }, { workerId: 'recovery', streams: ['transactional'], batchSize: 50, leaseSeconds: 60, maxSubmissionAttempts: 3, reconcileGraceSeconds: 10 }, log);
    await worker.tick(); expect((await recipientStates(h, id))['success@simulate.mail-platform.invalid']!.state).toBe('REMOTE_ACCEPTED'); expect(submit).not.toHaveBeenCalled();
  });
  it('repeats bounce scenarios and separates simulated analytics from live usage', async () => {
    const submit = vi.fn(async () => { throw new Error('unexpected MTA'); });
    const worker = new Dispatcher(h.dbs.service, h.core, { submit, close() {} }, { workerId: 'repeat', streams: ['transactional'], batchSize: 50, leaseSeconds: 60, maxSubmissionAttempts: 3, reconcileGraceSeconds: 10 }, log);
    for (let i = 0; i < 2; i++) {
      const id = (await send({ to: 'bounce@simulate.mail-platform.invalid' })).json().id;
      await worker.tick(); expect((await recipientStates(h, id))['bounce@simulate.mail-platform.invalid']!.state).toBe('BOUNCED');
    }
    const simulated = (await h.app.inject({ method: 'GET', url: '/v1/analytics?test_mode=true', headers: bearer(account.apiKey) })).json();
    const live = (await h.app.inject({ method: 'GET', url: '/v1/analytics', headers: bearer(account.apiKey) })).json();
    expect(simulated.data.some((e: { type: string }) => e.type === 'email.bounced')).toBe(true); expect(live.data).toHaveLength(0);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('webhook operations', () => {
  it('sends signed test events through normal delivery and throttles and scopes them', async () => {
    const endpoint = (await h.app.inject({ method: 'POST', url: '/v1/webhooks', headers: bearer(account.apiKey), payload: { url: h.webhookReceiver.url, event_types: ['email.accepted'] } })).json();
    const url = `/v1/webhooks/${endpoint.id}/test`;
    expect((await h.app.inject({ method: 'POST', url, headers: bearer(other.apiKey) })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'POST', url, headers: bearer(account.apiKey) })).statusCode).toBe(202);
    expect((await h.app.inject({ method: 'POST', url, headers: bearer(account.apiKey) })).statusCode).toBe(429);
    await h.webhooks.tick();
    const received = h.webhookReceiver.received.find(r => JSON.parse(r.body).data.endpoint_id === endpoint.id)!;
    expect(JSON.parse(received.body).type).toBe('webhook.test');
    expect(received.headers['webhook-signature']).toBe(signWebhook(endpoint.secret, String(received.headers['webhook-id']), Number(received.headers['webhook-timestamp']), received.body));
  });
  it('disables sustained failures, persists a tenant-scoped notification and allows recovery', async () => {
    const created = await h.app.inject({ method: 'POST', url: '/v1/webhooks', headers: bearer(account.apiKey), payload: { url: h.webhookReceiver.url, event_types: ['email.accepted'] } });
    const id = created.json().id;
    const queued = await h.app.inject({ method: 'POST', url: `/v1/webhooks/${id}/test`, headers: bearer(account.apiKey) });
    const deliveryId = queued.json().id;
    let ok = false;
    const worker = new WebhookDispatcher(h.dbs.service, h.core.secrets, async () => ({ ok, statusCode: ok ? 200 : 503, error: ok ? null : 'HTTP 503', durationMs: 1 }), log, 20, { failureThreshold: 2, failureWindowMs: 0 });
    await worker.tick();
    expect((await h.dbs.service.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id)))[0]!.enabled).toBe(true);
    await h.dbs.service.update(webhookDeliveries).set({ nextAttemptAt: new Date(0) }).where(eq(webhookDeliveries.id, deliveryId)); await worker.tick();
    const [disabled] = await h.dbs.service.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    expect(disabled).toMatchObject({ enabled: false, consecutiveFailures: 2, disabledReason: 'sustained_delivery_failures' });
    expect(await h.dbs.service.select().from(notifications).where(eq(notifications.resourceId, id))).toHaveLength(1);
    expect(await withTenant(h.dbs.app, other.orgId, tx => tx.select().from(notifications).where(eq(notifications.resourceId, id)))).toHaveLength(0);
    expect((await h.app.inject({ method: 'GET', url: '/v1/notifications', headers: sessionHeaders(account.cookie) })).json().data.some((n: { resource_id: string }) => n.resource_id === id)).toBe(true);
    expect((await h.app.inject({ method: 'POST', url: `/v1/webhooks/${id}/test`, headers: bearer(account.apiKey) })).statusCode).toBe(409);
    expect((await h.app.inject({ method: 'PATCH', url: `/v1/webhooks/${id}`, headers: bearer(account.apiKey), payload: { enabled: true } })).statusCode).toBe(200);
    ok = true; await h.dbs.service.update(webhookDeliveries).set({ nextAttemptAt: new Date(0) }).where(eq(webhookDeliveries.id, deliveryId)); await worker.tick();
    const [recovered] = await h.dbs.service.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    expect(recovered).toMatchObject({ enabled: true, consecutiveFailures: 0, firstFailureAt: null }); expect(recovered!.lastSuccessAt).not.toBeNull();
  });
  it('requires the failure duration and ignores a stale failure after manual re-enabling', async () => {
    const created = await h.app.inject({ method: 'POST', url: '/v1/webhooks', headers: bearer(account.apiKey), payload: { url: h.webhookReceiver.url, event_types: ['email.accepted'] } });
    const id = created.json().id;
    const queued = await h.app.inject({ method: 'POST', url: `/v1/webhooks/${id}/test`, headers: bearer(account.apiKey) }); const deliveryId = queued.json().id;
    const worker = new WebhookDispatcher(h.dbs.service, h.core.secrets, async () => ({ ok: false, statusCode: 503, error: 'HTTP 503', durationMs: 1 }), log, 20, { failureThreshold: 1, failureWindowMs: 86400_000 });
    await worker.tick();
    expect((await h.dbs.service.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id)))[0]!.enabled).toBe(true);
    let started!: () => void, release!: () => void;
    const sending = new Promise<void>(resolve => { started = resolve; }); const blocked = new Promise<void>(resolve => { release = resolve; });
    const stale = new WebhookDispatcher(h.dbs.service, h.core.secrets, async () => { started(); await blocked; return { ok: false, statusCode: 503, error: 'stale failure', durationMs: 1 }; }, log, 20, { failureThreshold: 1, failureWindowMs: 0 });
    await h.dbs.service.update(webhookDeliveries).set({ nextAttemptAt: new Date(0) }).where(eq(webhookDeliveries.id, deliveryId));
    const pending = stale.tick(); await sending;
    try {
      expect((await h.app.inject({ method: 'PATCH', url: `/v1/webhooks/${id}`, headers: bearer(account.apiKey), payload: { enabled: true } })).statusCode).toBe(200);
    } finally { release(); }
    await pending;
    const [endpoint] = await h.dbs.service.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    expect(endpoint).toMatchObject({ enabled: true, consecutiveFailures: 0 });
    expect(await h.dbs.service.select().from(notifications).where(eq(notifications.resourceId, id))).toHaveLength(0);
  });
});
