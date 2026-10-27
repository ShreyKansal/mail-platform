import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import nodemailer from 'nodemailer';
import selfsigned from 'selfsigned';
import type { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSubmissionServer } from '@mp/smtp-submission/server';
import { createLogger } from '@mp/shared';
import { addVerifiedDomain, bearer, createAccount, createHarness, recipientStates, sessionHeaders, type Account, type Harness } from '../support/harness';

let h: Harness;
let acct: Account;
let starttls: SMTPServer;
let implicit: SMTPServer;
let ports: { starttls: number; implicit: number };
let creds: { username: string; password: string; id: string };
const run = randomBytes(3).toString('hex');
const domain = `smtp-${run}.test`;

const listen = (s: SMTPServer) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.server.address() as AddressInfo).port)));

beforeAll(async () => {
  h = await createHarness();
  acct = await createAccount(h, `smtp-${run}`);
  await addVerifiedDomain(h, acct, domain);
  const pems = selfsigned.generate([{ name: 'commonName', value: 'smtp.test' }], { days: 1, keySize: 2048 });
  const common = { dbs: h.dbs, redis: h.redis, log: createLogger('smtp-test', 'warn'), hostname: 'smtp.test', tls: { key: pems.private, cert: pems.cert }, maxMessageBytes: 1_000_000, maxRecipients: 5 };
  starttls = createSubmissionServer({ ...common, secure: false });
  implicit = createSubmissionServer({ ...common, secure: true });
  ports = { starttls: await listen(starttls), implicit: await listen(implicit) };

  const res = await h.app.inject({ method: 'POST', url: '/v1/smtp-credentials', headers: sessionHeaders(acct.cookie), payload: { name: 'app server' } });
  expect(res.statusCode).toBe(201);
  creds = { username: res.json().username, password: res.json().password, id: res.json().id };
});

afterAll(async () => {
  await new Promise<void>((r) => starttls?.close(() => r()));
  await new Promise<void>((r) => implicit?.close(() => r()));
  await h?.close();
});

const transport = (opts: { port: number; secure: boolean; auth?: { user: string; pass: string } | undefined; ignoreTLS?: boolean }) =>
  nodemailer.createTransport({
    host: '127.0.0.1',
    port: opts.port,
    secure: opts.secure,
    requireTLS: !opts.secure && !opts.ignoreTLS,
    ignoreTLS: opts.ignoreTLS ?? false,
    tls: { rejectUnauthorized: false },
    auth: opts.auth,
  });

describe('Test D — authenticated SMTP submission', () => {
  it('accepts mail over STARTTLS (587-style) with SMTP AUTH and delivers it', async () => {
    const info = await transport({ port: ports.starttls, secure: false, auth: { user: creds.username, pass: creds.password } }).sendMail({
      from: `"Billing" <billing@${domain}>`,
      to: `accept-smtp-${run}@mx-sim.test`,
      bcc: `accept-bcc-${run}@mx-sim.test`,
      subject: 'via smtp',
      text: 'hello over smtp',
      headers: { 'X-Order-Id': '991' },
    });
    const id = /Queued as ([0-9a-f-]{36})/.exec(info.response)?.[1];
    expect(id).toBeDefined();
    const states = await h.pumpUntil(async () => {
      const s = await recipientStates(h, id!);
      return Object.values(s).length === 2 && Object.values(s).every((r) => r.state === 'REMOTE_ACCEPTED') ? s : null;
    });
    expect(Object.keys(states).sort()).toEqual([`accept-bcc-${run}@mx-sim.test`, `accept-smtp-${run}@mx-sim.test`]);
    const detail = (await h.app.inject({ method: 'GET', url: `/v1/emails/${id}`, headers: bearer(acct.apiKey) })).json();
    expect(detail.source).toBe('smtp');
    expect(detail.to).toEqual([`accept-smtp-${run}@mx-sim.test`]);
  });

  it('accepts mail over implicit TLS (465-style)', async () => {
    const info = await transport({ port: ports.implicit, secure: true, auth: { user: creds.username, pass: creds.password } }).sendMail({
      from: `noreply@${domain}`,
      to: `accept-465-${run}@mx-sim.test`,
      subject: 'implicit tls',
      text: 'x',
    });
    expect(info.response).toMatch(/^250 .*Queued as/);
  });
  it('deduplicates immutable SMTP retries and rejects key reuse with changed content or envelope', async () => {
    const from = `noreply@${domain}`; const to = `accept-idem-smtp-${run}@mx-sim.test`;
    const raw = Buffer.from(`From: ${from}\r\nTo: ${to}\r\nSubject: SMTP idempotency\r\nX-MP-Idempotency-Key: smtp-${run}\r\nContent-Type: text/plain\r\n\r\nHello\r\n`);
    const tx = transport({ port: ports.starttls, secure: false, auth: { user: creds.username, pass: creds.password } });
    const first = await tx.sendMail({ envelope: { from, to }, raw });
    const second = await tx.sendMail({ envelope: { from, to }, raw });
    expect(second.response).toBe(first.response);
    await expect(tx.sendMail({ envelope: { from, to }, raw: Buffer.concat([raw, Buffer.from('changed')]) })).rejects.toMatchObject({ responseCode: 550 });
    await expect(tx.sendMail({ envelope: { from, to: [to, 'hidden@example.test'] }, raw })).rejects.toMatchObject({ responseCode: 550 });
  });

  it('is not an open relay: unauthenticated MAIL FROM is refused', async () => {
    await expect(
      transport({ port: ports.starttls, secure: false }).sendMail({ from: `noreply@${domain}`, to: 'victim@example.org', subject: 'relay?', text: 'x' }),
    ).rejects.toMatchObject({ responseCode: 530 });
  });

  it('never offers AUTH before TLS', async () => {
    await expect(
      transport({ port: ports.starttls, secure: false, ignoreTLS: true, auth: { user: creds.username, pass: creds.password } }).sendMail({
        from: `noreply@${domain}`,
        to: 'x@example.org',
        subject: 'plaintext auth',
        text: 'x',
      }),
    ).rejects.toThrow();
  });

  it('rejects bad credentials with 535', async () => {
    await expect(
      transport({ port: ports.starttls, secure: false, auth: { user: creds.username, pass: 'wrong-password' } }).sendMail({
        from: `noreply@${domain}`,
        to: 'x@example.org',
        subject: 'bad auth',
        text: 'x',
      }),
    ).rejects.toMatchObject({ responseCode: 535 });
  });

  it('rejects From addresses outside the verified domains with 550 5.7.1', async () => {
    await expect(
      transport({ port: ports.starttls, secure: false, auth: { user: creds.username, pass: creds.password } }).sendMail({
        from: 'ceo@bank.example',
        to: `accept-${run}@mx-sim.test`,
        subject: 'spoof',
        text: 'x',
      }),
    ).rejects.toMatchObject({ responseCode: 550 });
  });

  it('stops accepting a credential as soon as it is revoked', async () => {
    const del = await h.app.inject({ method: 'DELETE', url: `/v1/smtp-credentials/${creds.id}`, headers: sessionHeaders(acct.cookie) });
    expect(del.statusCode).toBe(200);
    await expect(
      transport({ port: ports.starttls, secure: false, auth: { user: creds.username, pass: creds.password } }).sendMail({
        from: `noreply@${domain}`,
        to: 'x@example.org',
        subject: 'revoked',
        text: 'x',
      }),
    ).rejects.toMatchObject({ responseCode: 535 });
  });
});
