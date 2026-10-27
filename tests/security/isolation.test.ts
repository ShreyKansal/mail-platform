import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emails, organizations, eq, withTenant, sql } from '@mp/database';
import { buildApp } from '@mp/api/app';
import { addVerifiedDomain, bearer, createAccount, createHarness, publishRecords, sessionHeaders, type Account, type Harness } from '../support/harness';

let h: Harness;
let a: Account;
let b: Account;
let emailOfA: string;
const run = randomBytes(3).toString('hex');
const domainA = `tenant-a-${run}.test`;

/** Drizzle wraps driver errors; the Postgres message is on `cause`. */
const pgError = (pattern: RegExp) => (err: unknown) => pattern.test(String((err as { cause?: { message?: string } }).cause?.message ?? ''));

beforeAll(async () => {
  h = await createHarness();
  a = await createAccount(h, `a-${run}`);
  b = await createAccount(h, `b-${run}`);
  await addVerifiedDomain(h, a, domainA);
  const res = await h.app.inject({
    method: 'POST',
    url: '/v1/emails',
    headers: bearer(a.apiKey),
    payload: { from: `noreply@${domainA}`, to: `accept-${run}@mx-sim.test`, subject: 'tenant A secret', text: 'private' },
  });
  emailOfA = res.json().id;
});
afterAll(async () => h?.close());

describe('cross-tenant isolation', () => {
  it('persists tenant quotas, enforces them locally, and rejects API-key edits', async () => {
    const c = await createAccount(h, `quota-settings-${run}`);
    await addVerifiedDomain(h, c, `quota-settings-${run}.test`);
    const previous = h.core.localUnlimitedSending;
    h.core.localUnlimitedSending = true;
    // Routes capture availability when registered; build a fresh app for this configuration.
    const app = await buildApp({ ...h, core: h.core, dns: { platform: h.core.platform, dns: { txt: async () => ({ ok: true, records: [] }), mx: async () => ({ ok: true, records: [] }), raw: async () => [] } } }, { logger: false });
    try {
      const payload = { daily_recipient_limit: 1, per_minute_recipient_limit: 1, unlimited: false };
      const saved = await app.inject({ method: 'PATCH', url: '/v1/settings/quotas', headers: sessionHeaders(c.cookie), payload });
      expect(saved.statusCode).toBe(200);
      const read = await app.inject({ method: 'GET', url: '/v1/settings/quotas', headers: sessionHeaders(c.cookie) });
      expect(read.json()).toMatchObject(payload);
      const session = await app.inject({ method: 'GET', url: '/auth/session', headers: sessionHeaders(c.cookie) });
      expect(session.json().organization.local_unlimited_sending).toBe(false);
      const blocked = await app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(c.apiKey), payload: { from: `hello@quota-settings-${run}.test`, to: ['one@mx-sim.test', 'two@mx-sim.test'], subject: 'quota', text: 'quota' } });
      expect(blocked.statusCode).toBe(429);
      const untouched = await app.inject({ method: 'GET', url: '/v1/settings/quotas', headers: sessionHeaders(b.cookie) });
      expect(untouched.json().daily_recipient_limit).toBe(10000);
      expect((await app.inject({ method: 'PATCH', url: '/v1/settings/quotas', headers: bearer(c.apiKey), payload })).statusCode).toBe(403);
      expect((await app.inject({ method: 'PATCH', url: '/v1/settings/quotas', headers: sessionHeaders(c.cookie), payload: { ...payload, daily_recipient_limit: 0 } })).statusCode).toBe(422);
      expect((await app.inject({ method: 'PATCH', url: '/v1/settings/quotas', headers: sessionHeaders(c.cookie), payload: { ...payload, unlimited: true } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/auth/session', headers: sessionHeaders(c.cookie) })).json().organization.local_unlimited_sending).toBe(true);
    } finally { await app.close(); h.core.localUnlimitedSending = previous; }
  });
  it('tenant B cannot read tenant A resources through the API', async () => {
    expect((await h.app.inject({ method: 'GET', url: `/v1/emails/${emailOfA}`, headers: bearer(b.apiKey) })).statusCode).toBe(404);
    const list = await h.app.inject({ method: 'GET', url: '/v1/emails', headers: bearer(b.apiKey) });
    expect(list.json().data).toHaveLength(0);
    const domains = await h.app.inject({ method: 'GET', url: '/v1/domains', headers: bearer(b.apiKey) });
    expect(domains.json().data).toHaveLength(0);
    expect((await h.app.inject({ method: 'POST', url: `/v1/emails/${emailOfA}/cancel`, headers: bearer(b.apiKey) })).statusCode).toBe(404);
  });

  it('row-level security hides other tenants even when a query has no tenant filter', async () => {
    const asB = await withTenant(h.dbs.app, b.orgId, (tx) => tx.select({ id: emails.id }).from(emails));
    expect(asB).toHaveLength(0);
    const asA = await withTenant(h.dbs.app, a.orgId, (tx) => tx.select({ id: emails.id }).from(emails));
    expect(asA.map((e) => e.id)).toContain(emailOfA);
    // Without a bound tenant the app role sees nothing at all.
    const unbound = await h.dbs.app.select({ id: emails.id }).from(emails);
    expect(unbound).toHaveLength(0);
  });

  it('row-level security rejects writes into another tenant', async () => {
    await expect(
      withTenant(h.dbs.app, b.orgId, (tx) => tx.update(organizations).set({ dailyRecipientLimit: 1_000_000 }).where(eq(organizations.id, a.orgId)).returning()),
    ).resolves.toHaveLength(0);
    await expect(
      withTenant(h.dbs.app, b.orgId, (tx) => tx.execute(sql`insert into suppressions (org_id, address_lower, reason) values (${a.orgId}, 'x@y.z', 'manual')`)),
    ).rejects.toSatisfy(pgError(/row-level security/));
  });

  it('the app role cannot read password hashes or sessions', async () => {
    await expect(withTenant(h.dbs.app, a.orgId, (tx) => tx.execute(sql`select password_hash from users`))).rejects.toSatisfy(pgError(/permission denied/));
    await expect(withTenant(h.dbs.app, a.orgId, (tx) => tx.execute(sql`select token_hash from user_sessions`))).rejects.toSatisfy(
      pgError(/permission denied/),
    );
  });

  it('a domain verified by tenant A cannot be claimed by tenant B, even with B publishing its own token', async () => {
    const created = await h.app.inject({ method: 'POST', url: '/v1/domains', headers: bearer(b.apiKey), payload: { name: domainA } });
    expect(created.statusCode).toBe(201);
    const d = created.json();
    // A's ownership token is already published; B's differs, so B's ownership check fails.
    const first = await h.app.inject({ method: 'POST', url: `/v1/domains/${d.id}/verify`, headers: bearer(b.apiKey) });
    expect(first.json().records.find((r: { purpose: string }) => r.purpose === 'ownership').status).toBe('invalid');
    // Even if B gets its token and key published, the global uniqueness guard refuses a second verified owner.
    publishRecords(h, d.records, { only: ['ownership', 'dkim'] });
    await h.redis.del(`verify:${d.id}`);
    const second = await h.app.inject({ method: 'POST', url: `/v1/domains/${d.id}/verify`, headers: bearer(b.apiKey) });
    expect(second.statusCode).toBe(409);
  });
});

describe('sending authorization and input safety', () => {
  it('rejects unverified From domains', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: bearer(b.apiKey),
      payload: { from: `noreply@${domainA}`, to: 'x@example.org', subject: 'spoof', text: 'x' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('domain_not_verified');
  });

  it.each([
    [{ subject: 'Hi\r\nBcc: victim@example.org' }, 'subject'],
    [{ to: 'a@example.org\r\nBcc: victim@example.org' }, 'to[0]'],
    [{ headers: { 'X-Ok': 'v\r\nBcc: victim@example.org' } }, 'headers.X-Ok'],
    [{ headers: { From: 'ceo@bank.example' } }, 'headers.From'],
    [{ headers: { 'DKIM-Signature': 'forged' } }, 'headers.DKIM-Signature'],
    [{ attachments: [{ filename: 'invoice.exe', content: 'TVqQ' }] }, 'attachments[0].filename'],
  ])('blocks header injection and unsafe input: %j', async (patch, path) => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: bearer(a.apiKey),
      payload: { from: `noreply@${domainA}`, to: 'x@example.org', subject: 'ok', text: 'x', ...patch },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.details.map((d: { path: string }) => d.path)).toContain(path);
  });

  it('distinguishes unparseable requests (400) from invalid ones (422) and uses one path syntax', async () => {
    const malformed = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: { ...bearer(a.apiKey), 'content-type': 'application/json' },
      payload: '{"from": "noreply@x.test",',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('bad_request');

    const schemaInvalid = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: bearer(a.apiKey),
      payload: { from: `noreply@${domainA}`, to: 'ok@example.org', subject: 's', text: 'x', attachments: [{ filename: 'a.txt', content: 'not base64!' }] },
    });
    expect(schemaInvalid.statusCode).toBe(422);
    expect(schemaInvalid.json().error.details.map((d: { path: string }) => d.path)).toContain('attachments[0].content');
  });

  it('enforces API key scopes and revocation', async () => {
    const sending = await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: sessionHeaders(a.cookie), payload: { name: 'send only', scope: 'sending_access' } });
    const key = sending.json().token as string;
    expect((await h.app.inject({ method: 'GET', url: '/v1/domains', headers: bearer(key) })).statusCode).toBe(403);
    expect((await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: bearer(a.apiKey), payload: { name: 'escalate' } })).statusCode).toBe(403);
    const ok = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(key), payload: { from: `noreply@${domainA}`, to: 'x@example.org', subject: 's', text: 'x' } });
    expect(ok.statusCode).toBe(202);

    await h.app.inject({ method: 'DELETE', url: `/v1/api-keys/${sending.json().id}`, headers: sessionHeaders(a.cookie) });
    const revoked = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(key), payload: { from: `noreply@${domainA}`, to: 'x@example.org', subject: 's', text: 'x' } });
    expect(revoked.statusCode).toBe(401);
  });

  it('enforces the per-tenant sending quota', async () => {
    const c = await createAccount(h, `quota-${run}`, { liftLimits: false });
    await h.dbs.service.update(organizations).set({ perMinuteRecipientLimit: 2 }).where(eq(organizations.id, c.orgId));
    const domain = `quota-${run}.test`;
    await addVerifiedDomain(h, c, domain);
    const send = (n: number) =>
      h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(c.apiKey), payload: { from: `n@${domain}`, to: Array.from({ length: n }, (_, i) => `r${i}@example.org`), subject: 'q', text: 'x' } });
    expect((await send(2)).statusCode).toBe(202);
    const over = await send(1);
    expect(over.statusCode).toBe(429);
    expect(over.json().error.code).toBe('rate_limited');
  });

  it('applies the local development quota override without bypassing suspension', async () => {
    const c = await createAccount(h, `local-quota-${run}`, { liftLimits: false });
    await h.dbs.service.update(organizations).set({ dailyRecipientLimit: 1, perMinuteRecipientLimit: 1 }).where(eq(organizations.id, c.orgId));
    const domain = `local-quota-${run}.test`;
    await addVerifiedDomain(h, c, domain);
    const previous = h.core.localUnlimitedSending;
    h.core.localUnlimitedSending = true;
    try {
      const sent = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(c.apiKey), payload: { from: `n@${domain}`, to: ['one@example.org', 'two@example.org'], subject: 'local quota', text: 'x' } });
      expect(sent.statusCode).toBe(202);
      const session = await h.app.inject({ method: 'GET', url: '/auth/session', headers: sessionHeaders(c.cookie) });
      expect(session.json().organization.local_unlimited_sending).toBe(true);
      await h.dbs.service.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, c.orgId));
      const blocked = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(c.apiKey), payload: { from: `n@${domain}`, to: 'three@example.org', subject: 'blocked', text: 'x' } });
      expect(blocked.statusCode).not.toBe(202);
    } finally {
      h.core.localUnlimitedSending = previous ?? false;
    }
  });
});

describe('dashboard session protections', () => {
  it('requires the CSRF header and a matching Origin for cookie-authenticated writes', async () => {
    const payload = { name: 'x', scope: 'sending_access' };
    expect((await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: { cookie: a.cookie }, payload })).statusCode).toBe(403);
    expect(
      (await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: { cookie: a.cookie, 'x-mp-csrf': '1', origin: 'https://evil.example' }, payload })).statusCode,
    ).toBe(403);
    expect((await h.app.inject({ method: 'POST', url: '/v1/api-keys', headers: sessionHeaders(a.cookie), payload })).statusCode).toBe(201);
  });

  it('rejects wrong passwords with a generic message', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/auth/login', payload: { email: `owner-a-${run}@example.org`, password: 'nope' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe('invalid email or password');
  });
});

describe('webhook SSRF protection', () => {
  it('rejects private, loopback and metadata targets when private networks are not allowed', async () => {
    const strict = await buildApp(
      { config: { ...h.config, WEBHOOK_ALLOW_HTTP: false, WEBHOOK_ALLOW_PRIVATE_NETWORKS: false }, dbs: h.dbs, redis: h.redis, core: h.core, dns: { platform: h.core.platform, dns: { txt: async () => ({ ok: true, records: [] }), mx: async () => ({ ok: true, records: [] }), raw: async () => [] } } },
      { logger: false },
    );
    try {
      for (const url of ['https://169.254.169.254/latest/meta-data', 'https://127.0.0.1/hook', 'https://10.0.0.5/hook', 'https://[::1]/hook', 'http://example.com/hook', 'https://user:pass@example.com/hook']) {
        const res = await strict.inject({ method: 'POST', url: '/v1/webhooks', headers: bearer(a.apiKey), payload: { url, event_types: ['email.bounced'] } });
        expect(res.statusCode, url).toBe(422);
      }
    } finally {
      await strict.close();
    }
  });
});
