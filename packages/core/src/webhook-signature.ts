import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '@mp/shared';

/**
 * Webhook signatures follow the Standard Webhooks scheme:
 *
 *   webhook-id:        unique event delivery id (stable across retries)
 *   webhook-timestamp: unix seconds
 *   webhook-signature: "v1,<base64(HMAC-SHA256(key, `${id}.${timestamp}.${body}`))>"
 *
 * The secret is `whsec_<base64 key>`; the HMAC key is the decoded bytes.
 * Receivers must reject timestamps outside a tolerance window (replay protection).
 */
export const WEBHOOK_SECRET_PREFIX = 'whsec_';
export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64')}`;
}

function keyFromSecret(secret: string): Buffer {
  if (!secret.startsWith(WEBHOOK_SECRET_PREFIX)) throw new Error('webhook secret must start with whsec_');
  return Buffer.from(secret.slice(WEBHOOK_SECRET_PREFIX.length), 'base64');
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', keyFromSecret(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${mac}`;
}

export type VerifyFailure = 'missing_headers' | 'timestamp_out_of_tolerance' | 'invalid_signature';

export function verifyWebhook(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): { ok: true } | { ok: false; reason: VerifyFailure } {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }
  const expected = signWebhook(secret, id, ts, body);
  // The header may carry several space-separated signatures during secret rotation.
  const match = signature.split(' ').some((candidate) => safeEqual(candidate, expected));
  return match ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}
