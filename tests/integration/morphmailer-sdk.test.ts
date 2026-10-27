import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Morphmailer, type SendEmailOptions } from '../../packages/morphmailer/src/index';
import { addVerifiedDomain, createAccount, createHarness, type Harness } from '../support/harness';

let h: Harness;
let client: Morphmailer;
let email: SendEmailOptions;
beforeAll(async () => {
  h = await createHarness();
  const run = randomBytes(4).toString('hex');
  const account = await createAccount(h, `sdk-${run}`);
  const domain = `sdk-${run}.test`;
  await addVerifiedDomain(h, account, domain);
  // Exercise the real API routes, auth, schemas and database without opening a port.
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const response = await h.app.inject({ method: init?.method as 'GET' | 'POST' | 'PATCH', url: url.pathname + url.search, headers, ...(init?.body ? { payload: String(init.body) } : {}) });
    return new Response(response.body, { status: response.statusCode, headers: { 'Content-Type': 'application/json', 'x-request-id': String(response.headers['x-request-id']) } });
  };
  client = new Morphmailer(account.apiKey, { baseUrl: 'https://sdk.test', fetch: transport });
  email = { from: `hello@${domain}`, to: 'accept-sdk@mx-sim.test', subject: 'SDK integration', text: 'SDK integration' };
});
afterAll(async () => h?.close());

it('sends, replays safely, retrieves, lists, reschedules and cancels through the real API', async () => {
  const send = await client.emails.send(email, { idempotencyKey: 'sdk-single' });
  expect(send.error).toBeNull();
  if (!send.data) throw new Error('send failed');
  const replay = await client.emails.send(email, { idempotencyKey: 'sdk-single' });
  expect(replay.data?.id).toBe(send.data.id);
  expect((await client.emails.get(send.data.id)).data).toMatchObject({ subject: 'SDK integration', to: ['accept-sdk@mx-sim.test'] });
  expect((await client.emails.list({ search: 'SDK integration' })).data?.data.map(item => item.id)).toContain(send.data.id);
  const scheduled = await client.emails.send({ ...email, scheduled_at: new Date(Date.now() + 3600000).toISOString() });
  expect(scheduled.error).toBeNull();
  const id = scheduled.data!.id;
  const time = new Date(Date.now() + 7200000).toISOString();
  expect((await client.emails.update(id, { scheduled_at: time })).data?.scheduled_at).toBe(time);
  expect((await client.emails.cancel(id)).data?.cancelled).toBe(1);
  const batch = await client.batch.send([email, email], { idempotencyKey: 'sdk-batch' });
  expect(batch.error).toBeNull();
  expect(batch.data?.data).toHaveLength(2);
  const invalid = await client.emails.send({ ...email, from: 'hello@unverified-sdk.test' });
  expect(invalid.error).toMatchObject({ code: 'domain_not_verified', statusCode: 403 });
});
