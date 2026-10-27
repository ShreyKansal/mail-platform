import { randomBytes } from 'node:crypto';
import { dkimVerify } from 'mailauth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyWebhook } from '@mp/core';
import { suppressions, and, eq } from '@mp/database';
import { MAILPIT } from '../support/env';
import { addVerifiedDomain, bearer, createAccount, createHarness, publishRecords, recipientStates, sessionHeaders, type Account, type Harness } from '../support/harness';

let h: Harness;
let acct: Account;
const run = randomBytes(3).toString('hex');
const domainName = `acme-${run}.test`;

async function mailpitMessage(subject: string): Promise<string | null> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
  const body = (await res.json()) as { messages: Array<{ ID: string }> };
  const id = body.messages[0]?.ID;
  if (!id) return null;
  return (await fetch(`${MAILPIT}/api/v1/message/${id}/raw`)).text();
}

beforeAll(async () => {
  h = await createHarness();
  acct = await createAccount(h, `deliv-${run}`);
});
afterAll(async () => h?.close());

describe('Test A/B — onboarding and DNS authentication', () => {
  it('generates ownership, DKIM, return-path and DMARC records and only enables sending once required records pass', async () => {
    const created = await h.app.inject({ method: 'POST', url: '/v1/domains', headers: bearer(acct.apiKey), payload: { name: `pending-${run}.test` } });
    expect(created.statusCode).toBe(201);
    const d = created.json();
    expect(d.status).toBe('pending');
    expect(d.sending_enabled).toBe(false);
    const purposes = d.records.map((r: { purpose: string }) => r.purpose).sort();
    expect(purposes).toEqual(['dkim', 'dmarc', 'ownership', 'return_path_mx', 'return_path_spf']);
    const dkim = d.records.find((r: { purpose: string }) => r.purpose === 'dkim');
    expect(dkim.host).toMatch(new RegExp(`^mp\\d{8}[0-9a-f]{6}\\._domainkey\\.pending-${run}\\.test$`));
    expect(dkim.value).toMatch(/^v=DKIM1; k=rsa; p=MIIBIjAN/);

    // Only the ownership record published: still not sendable.
    publishRecords(h, d.records, { only: ['ownership'] });
    const partial = await h.app.inject({ method: 'POST', url: `/v1/domains/${d.id}/verify`, headers: bearer(acct.apiKey) });
    expect(partial.json().sending_enabled).toBe(false);
    const statuses = Object.fromEntries(partial.json().records.map((r: { purpose: string; status: string }) => [r.purpose, r.status]));
    expect(statuses).toMatchObject({ ownership: 'valid', dkim: 'missing', return_path_mx: 'missing', dmarc: 'missing' });
  });

  it('verifies a fully configured domain including custom Return-Path and DMARC enforcement', async () => {
    const d = await addVerifiedDomain(h, acct, domainName);
    expect(d.status).toBe('verified');
    expect(d.sending_enabled).toBe(true);
    expect(d.custom_return_path_active).toBe(true);
    for (const r of d.records) expect(r.status).toBe('valid');
  });
});

describe('Test C — independent delivery via the platform MTA', () => {
  it('delivers through Postfix to the remote MX with an aligned, valid DKIM signature and VERP return path', async () => {
    const subject = `Welcome ${run}`;
    const send = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: bearer(acct.apiKey),
      payload: {
        from: `Acme <noreply@${domainName}>`,
        to: [`customer-${run}@example.org`, `accept-${run}@mx-sim.test`],
        subject,
        html: '<p>Hello from the platform</p>',
        text: 'Hello from the platform',
        tags: [{ name: 'category', value: 'welcome' }],
      },
    });
    expect(send.statusCode).toBe(202);
    const { id } = send.json();

    const states = await h.pumpUntil(async () => {
      const s = await recipientStates(h, id);
      return Object.values(s).every((r) => r.state === 'REMOTE_ACCEPTED') ? s : null;
    });
    expect(Object.keys(states)).toHaveLength(2);

    const detail = (await h.app.inject({ method: 'GET', url: `/v1/emails/${id}`, headers: bearer(acct.apiKey) })).json();
    expect(detail.status).toBe('REMOTE_ACCEPTED');
    const types = detail.events.map((e: { type: string }) => e.type);
    expect(types).toContain('email.accepted');
    expect(types.filter((t: string) => t === 'email.mta_accepted')).toHaveLength(2);
    expect(types.filter((t: string) => t === 'email.remote_accepted')).toHaveLength(2);
    expect(detail.recipients.every((r: { last_smtp_code: number }) => r.last_smtp_code === 250)).toBe(true);

    // The copy captured by the sink (standing in for a remote MX) carries a DKIM signature that verifies.
    const raw = await h.pumpUntil(() => mailpitMessage(subject), 20_000);
    expect(raw).toMatch(new RegExp(`^Return-Path: <b\\+[a-z2-7]{26}-[a-z2-7]{16}@bounce\\.${domainName.replace('.', '\\.')}>`, 'mi'));
    expect(raw).toMatch(/^Feedback-ID: /m);
    const result = await dkimVerify(Buffer.from(raw), {
      resolver: async (name: string, type: string) => {
        const txt = h.zone[name]?.TXT;
        if (type === 'TXT' && txt) return txt.map((t) => [t]);
        throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
      },
    });
    expect(result.results[0]?.status.result).toBe('pass');
    expect(result.results[0]?.signingDomain).toBe(domainName);
  });

  it('honours idempotency keys: same body replays, different body conflicts', async () => {
    const key = `idem-${run}`;
    const payload = { from: `noreply@${domainName}`, to: `accept-idem-${run}@mx-sim.test`, subject: 'idempotent', text: 'x' };
    const a = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: { ...bearer(acct.apiKey), 'idempotency-key': key }, payload });
    const b = await h.app.inject({ method: 'POST', url: '/v1/emails', headers: { ...bearer(acct.apiKey), 'idempotency-key': key }, payload });
    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(202);
    expect(b.json().id).toBe(a.json().id);
    expect(b.headers['idempotent-replayed']).toBe('true');
    const c = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: { ...bearer(acct.apiKey), 'idempotency-key': key },
      payload: { ...payload, subject: 'different' },
    });
    expect(c.statusCode).toBe(409);
    expect(c.json().error.code).toBe('idempotency_conflict');
  });

  it('cancels scheduled emails before hand-off', async () => {
    const send = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: bearer(acct.apiKey),
      payload: { from: `noreply@${domainName}`, to: `accept-sched-${run}@mx-sim.test`, subject: 'later', text: 'x', scheduled_at: new Date(Date.now() + 3600_000).toISOString() },
    });
    const { id } = send.json();
    await h.pumpOnce();
    expect(Object.values(await recipientStates(h, id))[0]?.state).toBe('SCHEDULED');
    const cancel = await h.app.inject({ method: 'POST', url: `/v1/emails/${id}/cancel`, headers: bearer(acct.apiKey) });
    expect(cancel.json()).toMatchObject({ cancelled: 1 });
    expect(Object.values(await recipientStates(h, id))[0]?.state).toBe('CANCELLED');
    const again = await h.app.inject({ method: 'POST', url: `/v1/emails/${id}/cancel`, headers: bearer(acct.apiKey) });
    expect(again.statusCode).toBe(409);
  });
});

describe('Test E — bounce processing and suppression', () => {
  it('records a 550 5.1.1 rejection as a hard bounce, suppresses the address and refuses to send to it again', async () => {
    const bad = `unknown-${run}@mx-sim.test`;
    const send = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: bearer(acct.apiKey),
      payload: { from: `noreply@${domainName}`, to: bad, subject: 'will bounce', text: 'x' },
    });
    const { id } = send.json();
    const states = await h.pumpUntil(async () => {
      const s = await recipientStates(h, id);
      return s[bad]?.state === 'BOUNCED' ? s : null;
    });
    expect(states[bad]?.bounceClass).toBe('mailbox_unavailable');

    const [s] = await h.dbs.service.select().from(suppressions).where(and(eq(suppressions.orgId, acct.orgId), eq(suppressions.addressLower, bad)));
    expect(s?.reason).toBe('hard_bounce');

    const detail = (await h.app.inject({ method: 'GET', url: `/v1/emails/${id}`, headers: bearer(acct.apiKey) })).json();
    expect(detail.recipients[0]).toMatchObject({ state: 'BOUNCED', last_smtp_code: 550, last_enhanced_status: '5.1.1' });

    // Postfix's own DSN reaches the bounce processor too; it must not duplicate the bounce.
    await h.pumpUntil(async () => {
      const res = await h.app.inject({ method: 'GET', url: `/v1/suppressions?email=${encodeURIComponent(bad)}`, headers: bearer(acct.apiKey) });
      return res.json().data.length === 1;
    });

    const resend = await h.app.inject({
      method: 'POST',
      url: '/v1/emails',
      headers: bearer(acct.apiKey),
      payload: { from: `noreply@${domainName}`, to: bad, subject: 'second attempt', text: 'x' },
    });
    expect(Object.values(await recipientStates(h, resend.json().id))[0]?.state).toBe('SUPPRESSED');
  });

  it('does not suppress on policy rejections', async () => {
    const addr = `policy-${run}@mx-sim.test`;
    const { id } = (
      await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(acct.apiKey), payload: { from: `noreply@${domainName}`, to: addr, subject: 'policy', text: 'x' } })
    ).json();
    const states = await h.pumpUntil(async () => {
      const s = await recipientStates(h, id);
      return s[addr]?.state === 'BOUNCED' ? s : null;
    });
    expect(states[addr]?.bounceClass).toBe('policy_rejected');
    const list = await h.app.inject({ method: 'GET', url: `/v1/suppressions?email=${encodeURIComponent(addr)}`, headers: bearer(acct.apiKey) });
    expect(list.json().data).toHaveLength(0);
  });

  it('reports greylisting as DEFERRED (MTA-owned retry) and then remote acceptance', async () => {
    const addr = `defer-${run}@mx-sim.test`;
    const { id } = (
      await h.app.inject({ method: 'POST', url: '/v1/emails', headers: bearer(acct.apiKey), payload: { from: `noreply@${domainName}`, to: addr, subject: 'greylist', text: 'x' } })
    ).json();
    await h.pumpUntil(async () => (await recipientStates(h, id))[addr]?.state === 'DEFERRED', 30_000);
    await h.pumpUntil(async () => (await recipientStates(h, id))[addr]?.state === 'REMOTE_ACCEPTED', 120_000);
    const detail = (await h.app.inject({ method: 'GET', url: `/v1/emails/${id}`, headers: bearer(acct.apiKey) })).json();
    const deferred = detail.events.find((e: { type: string }) => e.type === 'email.deferred');
    expect(deferred.data.classification).toBe('greylisted');
    expect(deferred.data.retry_owner).toBe('mta');
    // Exactly one application hand-off: retries were Postfix's.
    expect(detail.events.filter((e: { type: string }) => e.type === 'email.mta_accepted')).toHaveLength(1);
  });
});

describe('Test F — webhooks', () => {
  it('delivers signed events that verify with the endpoint secret, and retries failures', async () => {
    const create = await h.app.inject({
      method: 'POST',
      url: '/v1/webhooks',
      headers: bearer(acct.apiKey),
      payload: { url: h.webhookReceiver.url, event_types: ['email.accepted', 'email.remote_accepted', 'email.bounced'] },
    });
    expect(create.statusCode).toBe(201);
    const { secret, id: endpointId } = create.json();
    expect(secret).toMatch(/^whsec_/);

    const listed = await h.app.inject({ method: 'GET', url: '/v1/webhooks', headers: bearer(acct.apiKey) });
    expect(JSON.stringify(listed.json())).not.toContain(secret);

    h.webhookReceiver.respondWith = 503;
    const { id: emailId } = (
      await h.app.inject({
        method: 'POST',
        url: '/v1/emails',
        headers: bearer(acct.apiKey),
        payload: { from: `noreply@${domainName}`, to: `accept-hook-${run}@mx-sim.test`, subject: 'hooks', text: 'x' },
      })
    ).json();

    await h.pumpUntil(async () => h.webhookReceiver.received.length >= 1, 20_000);
    const deliveries = await h.app.inject({ method: 'GET', url: `/v1/webhooks/${endpointId}/deliveries`, headers: bearer(acct.apiKey) });
    expect(deliveries.json().data.some((d: { status: string; last_status_code: number }) => d.status === 'retrying' && d.last_status_code === 503)).toBe(true);

    // Recover: make retries due now and accept them.
    h.webhookReceiver.respondWith = 200;
    await h.dbs.service.execute(`update webhook_deliveries set next_attempt_at = now() where status = 'retrying'`);
    await h.pumpUntil(async () => {
      const types = h.webhookReceiver.received
        .filter((r) => JSON.parse(r.body).data.email_id === emailId)
        .map((r) => JSON.parse(r.body).type as string);
      return types.includes('email.remote_accepted') && types.filter((t) => t === 'email.accepted').length >= 2;
    }, 60_000);

    for (const r of h.webhookReceiver.received) {
      const verdict = verifyWebhook(
        secret,
        { id: String(r.headers['webhook-id']), timestamp: String(r.headers['webhook-timestamp']), signature: String(r.headers['webhook-signature']) },
        r.body,
      );
      expect(verdict).toEqual({ ok: true });
    }
    // Retries reuse the same webhook-id so receivers can deduplicate.
    const acceptedIds = h.webhookReceiver.received.filter((r) => JSON.parse(r.body).type === 'email.accepted').map((r) => r.headers['webhook-id']);
    expect(new Set(acceptedIds).size).toBe(1);
  });
});

describe('Webhook secret rotation', () => {
  it('signs with both the new and previous secret during the overlap window', async () => {
    const create = await h.app.inject({
      method: 'POST',
      url: '/v1/webhooks',
      headers: bearer(acct.apiKey),
      payload: { url: `${h.webhookReceiver.url}?rotation`, event_types: ['email.accepted'] },
    });
    const { id: endpointId, secret: oldSecret } = create.json();
    const rotate = await h.app.inject({ method: 'POST', url: `/v1/webhooks/${endpointId}/rotate-secret`, headers: bearer(acct.apiKey) });
    expect(rotate.statusCode).toBe(200);
    const newSecret = rotate.json().secret as string;
    expect(newSecret).not.toBe(oldSecret);

    h.webhookReceiver.respondWith = 200;
    const { id: emailId } = (
      await h.app.inject({
        method: 'POST',
        url: '/v1/emails',
        headers: bearer(acct.apiKey),
        payload: { from: `noreply@${domainName}`, to: `accept-rot-${run}@mx-sim.test`, subject: 'rotation', text: 'x' },
      })
    ).json();
    const hit = await h.pumpUntil(async () =>
      h.webhookReceiver.received.find((r) => r.body.includes(emailId) && JSON.parse(r.body).type === 'email.accepted' && r.headers['webhook-signature']?.toString().includes(' ')),
    );
    const headers = { id: String(hit.headers['webhook-id']), timestamp: String(hit.headers['webhook-timestamp']), signature: String(hit.headers['webhook-signature']) };
    expect(headers.signature.split(' ')).toHaveLength(2);
    expect(verifyWebhook(newSecret, headers, hit.body)).toEqual({ ok: true });
    expect(verifyWebhook(oldSecret, headers, hit.body)).toEqual({ ok: true });
  });
});

describe('Overview analytics come from stored records', () => {
  it('reports recipient state counts and quota usage', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/v1/overview', headers: sessionHeaders(acct.cookie) });
    expect(res.statusCode).toBe(200);
    const o = res.json();
    expect(o.recipients_by_state.REMOTE_ACCEPTED).toBeGreaterThanOrEqual(2);
    expect(o.recipients_by_state.BOUNCED).toBeGreaterThanOrEqual(1);
    expect(o.verified_domains).toBe(1);
    expect(o.used_last_24h).toBeGreaterThan(0);
  });
});
