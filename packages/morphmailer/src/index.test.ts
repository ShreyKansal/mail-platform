import { describe, expect, it, vi } from 'vitest';
import { sendEmailRequest, batchSendRequest } from '@mp/contracts';
import { Morphmailer, type SendEmailOptions } from './index';

const email: SendEmailOptions = { from: 'hello@example.com', to: ['you@example.com'], subject: 'Hello', html: '<p>Works</p>' };
const json = (payload: unknown, status = 202, headers: Record<string, string> = {}) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const setup = (response = json({ id: 'email-1' })) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  return { client: new Morphmailer('secret-key', { baseUrl: 'https://mail.example.com/proxy/', fetch: fetcher }), fetcher };
};

describe('Morphmailer SDK', () => {
  it('supports campaign lifecycle, revision bodies, encoded filters and empty delete responses',async()=>{
    const {client,fetcher}=setup(json({id:'campaign-1',revision:2},200));
    await client.broadcasts.create({name:'Product news'});
    await client.broadcasts.send('campaign/unsafe',{expected_revision:2,scheduled_at:'2026-11-01T12:00:00Z'});
    expect(String(fetcher.mock.calls[1]![0])).toContain('/broadcasts/campaign%2Funsafe/send');
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({expected_revision:2,scheduled_at:'2026-11-01T12:00:00Z'});
    await client.broadcasts.list({search:'Product & news',status:'draft',cursor:'a+/='});
    expect(new URL(String(fetcher.mock.calls[2]![0])).searchParams.get('search')).toBe('Product & news');
    fetcher.mockResolvedValue(new Response(null,{status:204}));
    expect(await client.broadcasts.remove('draft-1')).toEqual({data:null,error:null});
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('sends contract-valid data, authentication and idempotency headers once', async () => {
    const { client, fetcher } = setup();
    expect(await client.emails.send(email, { idempotencyKey: 'welcome-1' })).toEqual({ data: { id: 'email-1' }, error: null });
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://mail.example.com/proxy/v1/emails');
    expect(request?.method).toBe('POST');
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer secret-key');
    expect(new Headers(request?.headers).get('Idempotency-Key')).toBe('welcome-1');
    expect(sendEmailRequest.parse(JSON.parse(String(request?.body)))).toMatchObject(email);
    expect(request?.redirect).toBe('error');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sends batch arrays and blocks empty/oversized batches', async () => {
    const { client, fetcher } = setup(json({ data: [{ id: 'email-1' }] }));
    await client.batch.send([email]);
    expect(batchSendRequest.parse(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)))).toHaveLength(1);
    expect((await client.batch.send([])).error?.code).toBe('validation_error');
    expect((await client.batch.send(Array.from({ length: 101 }, () => email))).error?.code).toBe('validation_error');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('encodes list filters/cursors and provides get, update and cancel routes', async () => {
    const { client, fetcher } = setup();
    fetcher.mockImplementation(async () => json({ data: [], next_cursor: null }, 200));
    await client.emails.list({ limit: 25, search: 'receipt & invoice', cursor: 'abc+/=' });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get('search')).toBe('receipt & invoice');
    expect(url.searchParams.get('cursor')).toBe('abc+/=');
    await client.emails.get('id/unsafe');
    expect(String(fetcher.mock.calls[1]![0])).toContain('/emails/id%2Funsafe');
    await client.emails.update('email-1', { scheduled_at: '2027-01-01T12:00:00Z' });
    expect(fetcher.mock.calls[2]![1]?.method).toBe('PATCH');
    await client.emails.cancel('email-1');
    expect(String(fetcher.mock.calls[3]![0])).toContain('/emails/email-1/cancel');
    expect(fetcher.mock.calls[3]![1]?.method).toBe('POST');
  });
  it('preserves structured server errors, field details and request IDs', async () => {
    const { client } = setup(json({ error: { code: 'quota_exceeded', message: 'Limit reached', details: [{ path: 'to', message: 'Too many recipients' }] }, request_id: 'body-id' }, 429, { 'x-request-id': 'header-id' }));
    expect(await client.emails.send(email)).toMatchObject({ data: null, error: { code: 'quota_exceeded', statusCode: 429, requestId: 'header-id', details: [{ path: 'to' }] } });
  });
  it('handles non-JSON upstream failures and network errors without exposing secrets', async () => {
    const { client, fetcher } = setup(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect((await client.emails.send(email)).error).toMatchObject({ code: 'invalid_response', statusCode: 502 });
    fetcher.mockRejectedValue(new Error('secret-key should never be returned'));
    const result = await client.emails.send(email);
    expect(result.error?.code).toBe('network_error');
    expect(JSON.stringify(result)).not.toContain('secret-key');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('supports caller cancellation and timeouts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new Error('aborted'));
      else init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const client = new Morphmailer('key', { baseUrl: 'https://mail.example.com', timeoutMs: 5, fetch: fetcher });
    expect((await client.emails.list({}, { signal: AbortSignal.abort() })).error?.code).toBe('request_aborted');
    expect((await client.emails.send(email)).error?.code).toBe('request_timeout');
  });
  it('rejects invalid configuration before sending', () => {
    expect(() => new Morphmailer('', { baseUrl: 'https://mail.example.com' })).toThrow();
    expect(() => new Morphmailer('key', { baseUrl: 'https://user:password@mail.example.com' })).toThrow();
    expect(() => new Morphmailer('key', { baseUrl: 'https://mail.example.com', timeoutMs: 0 })).toThrow();
  });
  it('exposes versioned automations and encodes run IDs with explicit event idempotency',async()=>{
    const {client,fetcher}=setup();fetcher.mockImplementation(async()=>json({id:'accepted'}));
    await client.automations.publish('flow/id',{expected_revision:3});expect(String(fetcher.mock.calls[0]![0])).toContain('/automations/flow%2Fid/publish');expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({expected_revision:3});
    await client.automationEvents.send({idempotency_key:'invoice-42',event:'paid',contact_id:'contact-id',properties:{amount:42}});expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toMatchObject({idempotency_key:'invoice-42',properties:{amount:42}});
    await client.automations.runs.get('flow','run/id');expect(String(fetcher.mock.calls[2]![0])).toContain('/automations/flow/runs/run%2Fid');
    await client.automations.runs.list('flow',{cursor:'a+/=',status:'failed'});expect(new URL(String(fetcher.mock.calls[3]![0])).searchParams.get('cursor')).toBe('a+/=');expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
