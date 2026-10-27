import { describe, expect, it } from 'vitest';
import { deterministicUuid } from './events';
import { generateWebhookSecret, signWebhook, verifyWebhook } from './webhook-signature';

describe('webhook signatures', () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ id: 'evt', type: 'email.bounced', data: { a: 1 } });
  const now = 1_790_000_000;

  it('verifies a valid signature', () => {
    const signature = signWebhook(secret, 'msg_1', now, body);
    expect(signature).toMatch(/^v1,[A-Za-z0-9+/]+=*$/);
    expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(now), signature }, body, now)).toEqual({ ok: true });
  });

  it('rejects tampered bodies, ids and secrets', () => {
    const signature = signWebhook(secret, 'msg_1', now, body);
    expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(now), signature }, `${body} `, now).ok).toBe(false);
    expect(verifyWebhook(secret, { id: 'msg_2', timestamp: String(now), signature }, body, now).ok).toBe(false);
    expect(verifyWebhook(generateWebhookSecret(), { id: 'msg_1', timestamp: String(now), signature }, body, now).ok).toBe(false);
  });

  it('rejects replays outside the tolerance window', () => {
    const old = now - 600;
    const signature = signWebhook(secret, 'msg_1', old, body);
    expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(old), signature }, body, now)).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
  });

  it('accepts any of several signatures during secret rotation', () => {
    const next = generateWebhookSecret();
    const header = `${signWebhook(secret, 'm', now, body)} ${signWebhook(next, 'm', now, body)}`;
    expect(verifyWebhook(next, { id: 'm', timestamp: String(now), signature: header }, body, now).ok).toBe(true);
  });

  it('rejects missing headers', () => {
    expect(verifyWebhook(secret, { id: 'm' }, body, now)).toEqual({ ok: false, reason: 'missing_headers' });
  });
});

describe('deterministic ids', () => {
  it('is stable and UUID-shaped', () => {
    const a = deterministicUuid('x');
    expect(a).toBe(deterministicUuid('x'));
    expect(a).not.toBe(deterministicUuid('y'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
