import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, apiRequestLogs, emailIdempotencyKeys, emailRecipients, emailShares, emails, eq, organizationMembers, sql, webhookAttempts, webhookDeliveries, webhookEndpoints, withTenant } from '@mp/database';
import { addVerifiedDomain, bearer, createAccount, createHarness, sessionHeaders, type Account, type Harness } from '../support/harness';
import { WebhookDispatcher } from '@mp/webhook-dispatcher/dispatcher';
import { createLogger } from '@mp/shared';

let h: Harness;
let account: Account;
let other: Account;
const run = randomBytes(4).toString('hex');
const domain = `parity-${run}.test`;
const later = () => new Date(Date.now() + 3600_000).toISOString();
const send = (extra: Record<string, unknown> = {}) => h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(account.apiKey), payload: { from: `sender@${domain}`, to: 'reader@example.test', subject: `parity ${run}`, text: 'private message body', scheduled_at: later(), ...extra } });
beforeAll(async () => { h = await createHarness(); account = await createAccount(h, `parity-${run}`); other = await createAccount(h, `parity-other-${run}`); await addVerifiedDomain(h, account, domain); });
afterAll(async () => h?.close());

describe('transactional parity', () => {
  it('reschedules all scheduled recipients and records an event', async () => {
    const sent = await send(); expect(sent.statusCode).toBe(202);
    const id = sent.json().id;
    const next = new Date(Date.now() + 7200_000).toISOString();
    const response = await h.app.inject({ method: 'PATCH', url: `/v1/emails/${id}`, headers: bearer(account.apiKey), payload: { scheduled_at: next } });
    expect(response.statusCode).toBe(200);
    const detail = (await h.app.inject({ method: 'GET', url: `/v1/emails/${id}`, headers: bearer(account.apiKey) })).json();
    expect(detail.scheduled_at).toBe(next);
    expect(detail.events.some((e: { type: string }) => e.type === 'email.rescheduled')).toBe(true);
    const rows = await h.dbs.service.select().from(emailRecipients).where(eq(emailRecipients.emailId, id));
    expect(rows.every((r) => r.nextAttemptAt.toISOString() === next)).toBe(true);
  });
  it('rejects past/far future schedules, cancelled emails and other tenants', async () => {
    const id = (await send()).json().id;
    for (const scheduled_at of [new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 31 * 86400_000).toISOString()]) {
      expect((await h.app.inject({ method: 'PATCH', url: `/v1/emails/${id}`, headers: bearer(account.apiKey), payload: { scheduled_at } })).statusCode).toBe(422);
    }
    expect((await h.app.inject({ method: 'PATCH', url: `/v1/emails/${id}`, headers: bearer(other.apiKey), payload: { scheduled_at: later() } })).statusCode).toBe(404);
    await h.app.inject({ method: 'POST', url: `/v1/emails/${id}/cancel`, headers: bearer(account.apiKey) });
    expect((await h.app.inject({ method: 'PATCH', url: `/v1/emails/${id}`, headers: bearer(account.apiKey), payload: { scheduled_at: later() } })).statusCode).toBe(409);
  });
  it('serializes a reschedule against a due worker claim without changing claimed recipients', async () => {
    const id = (await send()).json().id;
    await h.dbs.service.update(emailRecipients).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(emailRecipients.emailId, id));
    const next = new Date(Date.now() + 7200_000).toISOString();
    const [reschedule, claimed] = await Promise.all([
      h.app.inject({ method: 'PATCH', url: `/v1/emails/${id}`, headers: bearer(account.apiKey), payload: { scheduled_at: next } }),
      h.dbs.service.execute(sql`update email_recipients set state = 'DISPATCHING' where email_id = ${id} and state = 'SCHEDULED' and next_attempt_at <= now() returning id`),
    ]);
    if (reschedule.statusCode === 200) expect(claimed.rows).toHaveLength(0);
    else { expect(reschedule.statusCode).toBe(409); expect(claimed.rows).toHaveLength(1); }
  });
  it('preserves CID attachments and isolates content retrieval', async () => {
    const sent = await send({ html: '<img src="cid:logo">', attachments: [{ filename: 'logo.png', content: 'aGVsbG8=', content_id: 'logo', content_type: 'image/png' }] });
    expect(sent.statusCode).toBe(202);
    const id = sent.json().id;
    const list = await h.app.inject({ method: 'GET', url: `/v1/emails/${id}/attachments`, headers: bearer(account.apiKey) });
    expect(list.statusCode).toBe(200);
    const attachment = list.json().data[0];
    expect(attachment).toMatchObject({ content_id: 'logo', size_bytes: 5 });
    const url = `/v1/emails/${id}/attachments/${attachment.id}`;
    expect((await h.app.inject({ method: 'GET', url, headers: bearer(account.apiKey) })).json().content).toBe('aGVsbG8=');
    expect((await h.app.inject({ method: 'GET', url, headers: bearer(other.apiKey) })).statusCode).toBe(404);
    const duplicate = await send({ attachments: [{ filename: 'a.png', content: 'aGk=', content_id: 'same' }, { filename: 'b.png', content: 'aGk=', content_id: 'same' }] });
    expect(duplicate.statusCode).toBe(422);
  });
  it('applies search, dates, source and key filters with cursor pagination', async () => {
    const sent = await send({ subject: `unique-${run}` }); expect(sent.statusCode).toBe(202);
    const [email] = await h.dbs.service.select().from(emails).where(eq(emails.id, sent.json().id));
    const query = new URLSearchParams({ search: `unique-${run}`, source: 'api', api_key_id: email!.apiKeyId!, created_after: new Date(Date.now() - 86400_000).toISOString(), created_before: later(), limit: '1' });
    const list = (await h.app.inject({ method: 'GET', url: `/v1/emails?${query}`, headers: bearer(account.apiKey) })).json();
    expect(list.data.map((e: { id: string }) => e.id)).toEqual([sent.json().id]);
    expect((await h.app.inject({ method: 'GET', url: `/v1/emails?search=${run}&source=smtp`, headers: bearer(account.apiKey) })).json().data).toHaveLength(0);
  });
  it('creates, expires and revokes public links without exposing tokens in request logs', async () => {
    const id = (await send({ subject: '<script>alert(1)</script>' })).json().id;
    const created = await h.app.inject({ method: 'POST', url: `/v1/emails/${id}/shares`, headers: bearer(account.apiKey) });
    expect(created.statusCode).toBe(201);
    const share = created.json(); const path = new URL(share.url).pathname;
    expect(Math.abs(new Date(share.expires_at).getTime() - Date.now() - 48 * 3600_000)).toBeLessThan(5000);
    const view = await h.app.inject({ method: 'GET', url: path });
    expect(view.statusCode).toBe(200); expect(view.body).toContain('&lt;script&gt;');
    expect(view.headers['content-security-policy']).toContain("default-src 'none'");
    const [stored] = await h.dbs.service.select().from(emailShares).where(eq(emailShares.id, share.id));
    expect(await withTenant(h.dbs.app, other.orgId, (tx) => tx.select().from(emailShares).where(eq(emailShares.id, share.id)))).toHaveLength(0);
    expect(stored!.tokenHash).not.toBe(path.split('/').pop());
    await h.dbs.service.update(emailShares).set({ expiresAt: new Date(0) }).where(eq(emailShares.id, share.id));
    expect((await h.app.inject({ method: 'GET', url: path })).statusCode).toBe(404);
    const second = (await h.app.inject({ method: 'POST', url: `/v1/emails/${id}/shares`, headers: bearer(account.apiKey) })).json();
    expect((await h.app.inject({ method: 'DELETE', url: `/v1/emails/${id}/shares/${second.id}`, headers: bearer(other.apiKey) })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'DELETE', url: `/v1/emails/${id}/shares/${second.id}`, headers: bearer(account.apiKey) })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'GET', url: new URL(second.url).pathname })).statusCode).toBe(404);
  });
  it('records only request metadata and exposes stored usage and events', async () => {
    const response = await send({ subject: 'log-safety', metadata: { secret: 'do-not-log' } }); expect(response.statusCode).toBe(202);
    const logs = await h.pumpUntil(async () => {
      const rows = await h.dbs.service.select().from(apiRequestLogs).where(eq(apiRequestLogs.requestId, response.headers['x-request-id'] as string));
      return rows.length ? rows : null;
    });
    expect(logs).toHaveLength(1); expect(logs[0]).toMatchObject({ route: '/v1/emails', statusCode: 202 });
    expect(await withTenant(h.dbs.app, other.orgId, (tx) => tx.select().from(apiRequestLogs).where(eq(apiRequestLogs.id, logs[0]!.id)))).toHaveLength(0);
    expect(JSON.stringify(logs)).not.toMatch(/private message body|do-not-log/);
    const list = (await h.app.inject({ method: 'GET', url: '/v1/logs?limit=100', headers: bearer(account.apiKey) })).json();
    expect(list.data.length).toBeGreaterThan(0);
    expect((await h.app.inject({ method: 'GET', url: `/v1/logs/${logs[0]!.id}`, headers: bearer(other.apiKey) })).statusCode).toBe(404);
    for (const url of ['/v1/usage?days=7', '/v1/analytics?days=7']) {
      const result = await h.app.inject({ method: 'GET', url, headers: bearer(account.apiKey) });
      expect(result.statusCode).toBe(200); expect(result.json().timezone).toBe('UTC'); expect(result.json().data.length).toBeGreaterThan(0);
    }
  });
  it('replays completed deliveries with retained history and a fresh retry cycle', async () => {
    const hookResult = await h.app.inject({ method: 'POST', url: '/v1/webhooks', headers: sessionHeaders(account.cookie), payload: { url: h.webhookReceiver.url, event_types: ['email.accepted'] } });
    expect(hookResult.statusCode).toBe(201);
    const hook = hookResult.json();
    await send(); await h.webhooks.tick();
    const [delivery] = await h.dbs.service.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, hook.id));
    expect(delivery!.status).toBe('succeeded');
    const url = `/v1/webhooks/${hook.id}/deliveries/${delivery!.id}`;
    expect((await h.app.inject({ method: 'POST', url: `${url}/replay`, headers: bearer(other.apiKey) })).statusCode).toBe(404);
    const replay = await h.app.inject({ method: 'POST', url: `${url}/replay`, headers: bearer(account.apiKey) }); expect(replay.statusCode).toBe(200);
    expect((await h.app.inject({ method: 'POST', url: `${url}/replay`, headers: bearer(account.apiKey) })).statusCode).toBe(409);
    h.webhookReceiver.respondWith = 503;
    await h.webhooks.tick();
    h.webhookReceiver.respondWith = 200;
    const [retried] = await h.dbs.service.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, delivery!.id));
    expect(retried).toMatchObject({ attempts: 2, retryCycleAttempts: 1, status: 'retrying' });
    const attempts = (await h.app.inject({ method: 'GET', url: `${url}/attempts`, headers: bearer(account.apiKey) })).json().data;
    expect(attempts.map((a: { attempt: number }) => a.attempt).sort()).toEqual([1, 2]);
    const history = await h.dbs.service.select().from(webhookAttempts).where(eq(webhookAttempts.deliveryId, delivery!.id)); expect(history).toHaveLength(2);
    await h.dbs.service.update(webhookDeliveries).set({ status: 'dead' }).where(eq(webhookDeliveries.id, delivery!.id));
    await h.dbs.service.update(webhookEndpoints).set({ enabled: false }).where(eq(webhookEndpoints.id, hook.id));
    expect((await h.app.inject({ method: 'POST', url: `${url}/replay`, headers: bearer(account.apiKey) })).statusCode).toBe(409);
  });
  it('fences an expired webhook worker from overwriting a newly queued replay', async () => {
    const hook = (await h.app.inject({ method: 'POST', url: '/v1/webhooks', headers: bearer(account.apiKey), payload: { url: h.webhookReceiver.url, event_types: ['email.accepted'] } })).json();
    await send();
    const [delivery] = await h.dbs.service.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, hook.id));
    // Isolate this record from pending deliveries left by the retry test.
    await h.dbs.service.update(webhookDeliveries).set({ nextAttemptAt: new Date(Date.now() + 86400_000) }).where(and(eq(webhookDeliveries.orgId, account.orgId), sql`${webhookDeliveries.id} <> ${delivery!.id}`));
    let started!: () => void; let release!: () => void;
    const sending = new Promise<void>((resolve) => { started = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const stale = new WebhookDispatcher(h.dbs.service, h.core.secrets, async () => { started(); await blocked; return { ok: true, statusCode: 200, error: null, durationMs: 1 }; }, createLogger('stale-test', 'silent'));
    const running = stale.tick(); await sending;
    try {
      await h.dbs.service.update(webhookDeliveries).set({ leaseExpiresAt: new Date(0) }).where(eq(webhookDeliveries.id, delivery!.id));
      await h.webhooks.tick();
      const replay = await h.app.inject({ method: 'POST', url: `/v1/webhooks/${hook.id}/deliveries/${delivery!.id}/replay`, headers: bearer(account.apiKey) });
      expect(replay.statusCode).toBe(200);
    } finally { release(); await running; }
    const [result] = await h.dbs.service.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, delivery!.id));
    expect(result).toMatchObject({ status: 'pending', attempts: 2, retryCycleAttempts: 0 });
    const history = await h.dbs.service.select().from(webhookAttempts).where(eq(webhookAttempts.deliveryId, delivery!.id)); expect(history).toHaveLength(2);
  });
  it('exports filtered metadata for admins and rejects API key export access', async () => {
    const created = await send({ subject: `=formula-${run}` }); expect(created.statusCode).toBe(202);
    const url = `/v1/emails/export?search=formula-${run}`;
    expect((await h.app.inject({ method: 'GET', url, headers: bearer(account.apiKey) })).statusCode).toBe(403);
    const response = await h.app.inject({ method: 'GET', url, headers: sessionHeaders(account.cookie) });
    expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toContain('text/csv');
    expect(response.body).toContain(`"'=formula-${run}"`);
    expect(response.body).not.toContain('private message body');
  });
  it('validates suppression batches atomically and keeps tenants isolated', async () => {
    const emails = [`batch-a-${run}@example.test`, `batch-b-${run}@example.test`];
    const add = await h.app.inject({ method: 'POST', url: '/v1/suppressions/batch', headers: bearer(account.apiKey), payload: { emails: [...emails, emails[0]] } });
    expect(add.statusCode).toBe(201); expect(add.json().added).toBe(2);
    const found = await h.app.inject({ method: 'GET', url: `/v1/suppressions/${encodeURIComponent(emails[0]!)}`, headers: bearer(account.apiKey) });
    expect(found.statusCode).toBe(200);
    expect((await h.app.inject({ method: 'GET', url: `/v1/suppressions/${found.json().id}`, headers: bearer(other.apiKey) })).statusCode).toBe(404);
    const rejected = await h.app.inject({ method: 'POST', url: '/v1/suppressions/batch', headers: bearer(account.apiKey), payload: { emails: ['valid-only@example.test', 'invalid'] } });
    expect(rejected.statusCode).toBe(422);
    expect((await h.app.inject({ method: 'GET', url: '/v1/suppressions/valid-only%40example.test', headers: bearer(account.apiKey) })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'POST', url: '/v1/suppressions/batch/remove', headers: bearer(other.apiKey), payload: { emails } })).json().removed).toBe(0);
    expect((await h.app.inject({ method: 'POST', url: '/v1/suppressions/batch/remove', headers: bearer(account.apiKey), payload: { emails } })).json().removed).toBe(2);
  });
  it('renames a key without changing its scope and prevents cross-tenant rename', async () => {
    const key = (await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: sessionHeaders(account.cookie), payload: { name: 'before', scope: 'sending_access' } })).json();
    const response = await h.app.inject({ method: 'PATCH', url: `/v1/api-keys/${key.id}`, headers: sessionHeaders(account.cookie), payload: { name: 'after' } });
    expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ name: 'after', scopes: ['sending_access'] });
    expect((await h.app.inject({ method: 'PATCH', url: `/v1/api-keys/${key.id}`, headers: sessionHeaders(other.cookie), payload: { name: 'stolen' } })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(key.token), payload: { from: `sender@${domain}`, to: 'reader@example.test', subject: 'renamed key', text: 'x', scheduled_at: later() } })).statusCode).toBe(202);
  });
  it('denies content retrieval and sharing to metadata-only roles', async () => {
    const id = (await send()).json().id;
    await h.dbs.service.update(organizationMembers).set({ role: 'analyst' }).where(eq(organizationMembers.orgId, account.orgId));
    try {
      expect((await h.app.inject({ method: 'GET', url: `/v1/emails/${id}/attachments`, headers: sessionHeaders(account.cookie) })).statusCode).toBe(403);
      expect((await h.app.inject({ method: 'POST', url: `/v1/emails/${id}/shares`, headers: sessionHeaders(account.cookie) })).statusCode).toBe(403);
    } finally { await h.dbs.service.update(organizationMembers).set({ role: 'owner' }).where(eq(organizationMembers.orgId, account.orgId)); }
  });
  it('reuses idempotency keys only after the 24-hour window has expired', async () => {
    const payload = { from: `sender@${domain}`, to: 'reader@example.test', subject: 'expiring idempotency', text: 'x', scheduled_at: later() };
    const headers = { ...bearer(account.apiKey), 'idempotency-key': `expire-${run}` };
    const first = await h.app.inject({ method: 'POST', url: '/v1/emails', headers, payload }); expect(first.statusCode).toBe(202);
    const [key] = await h.dbs.service.select().from(emailIdempotencyKeys).where(and(eq(emailIdempotencyKeys.orgId, account.orgId), eq(emailIdempotencyKeys.key, `expire-${run}`)));
    expect(Math.abs(key!.expiresAt.getTime() - Date.now() - 24 * 3600_000)).toBeLessThan(5000);
    await h.dbs.service.update(emailIdempotencyKeys).set({ expiresAt: new Date(0) }).where(and(eq(emailIdempotencyKeys.orgId, account.orgId), eq(emailIdempotencyKeys.key, `expire-${run}`)));
    const next = await h.app.inject({ method: 'POST', url: '/v1/emails', headers, payload }); expect(next.statusCode).toBe(202);
    expect(next.json().id).not.toBe(first.json().id);
  });
  it('fails scheduled mail if its sending key was revoked before dispatch', async () => {
    const key = (await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: sessionHeaders(account.cookie), payload: { name: 'scheduled-only', scope: 'sending_access' } })).json();
    const sent = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(key.token), payload: { from: `sender@${domain}`, to: 'reader@example.test', subject: 'revoked scheduled key', text: 'x', scheduled_at: later() } });
    expect(sent.statusCode).toBe(202);
    await h.app.inject({ method: 'DELETE', url: `/v1/api-keys/${key.id}`, headers: sessionHeaders(account.cookie) });
    await h.dbs.service.update(emailRecipients).set({ nextAttemptAt: new Date(0) }).where(eq(emailRecipients.emailId, sent.json().id));
    await h.dispatcher.tick();
    const [recipient] = await h.dbs.service.select().from(emailRecipients).where(eq(emailRecipients.emailId, sent.json().id));
    expect(recipient).toMatchObject({ state: 'FAILED' }); expect(recipient!.lastResponse).toContain('no longer active');
  });
  it('never downgrades enforced TLS to a plaintext-only recipient transport', async () => {
    const tlsDomain = `tls-${run}.test`;
    const domain = await addVerifiedDomain(h, account, tlsDomain);
    const update = await h.app.inject({ method: 'PATCH', url: `/v1/domains/${domain.id}`, headers: bearer(account.apiKey), payload: { tls_policy: 'enforced' } });
    expect(update.statusCode).toBe(200); expect(update.json().tls_policy).toBe('enforced');
    const sent = await send({ from: `sender@${tlsDomain}`, scheduled_at: undefined, subject: `tls-${run}` }); expect(sent.statusCode).toBe(202);
    const rows = await h.pumpUntil(async () => {
      const rows = await h.dbs.service.select().from(emailRecipients).where(eq(emailRecipients.emailId, sent.json().id));
      return rows[0]?.state === 'DEFERRED' ? rows : null;
    });
    expect(rows[0]!.lastResponse).toMatch(/TLS/i);
  });
});
