import { base32Decode, base32Encode, hmacSha256, safeEqual } from '@mp/shared';

/**
 * Variable Envelope Return Path.
 *
 *   MAIL FROM:<b+{recipient}-{mac}@{bounce-domain}>
 *
 * - `recipient` is the 16-byte recipient delivery id (random UUIDv4) in base32:
 *   opaque, collision resistant and contains no tenant or address data.
 * - `mac` is HMAC-SHA256(secret, "verp:v1:" + recipient bytes) truncated to 80 bits,
 *   so forged bounces for arbitrary recipients are rejected before any DB lookup.
 *
 * Local part length is 2 + 26 + 1 + 16 = 45 characters (limit 64), lowercase only
 * so case-folding MTAs cannot corrupt it.
 */
const PATTERN = /^b\+([a-z2-7]{26})-([a-z2-7]{16})@([a-z0-9.-]+)$/;

const uuidToBytes = (id: string): Buffer => {
  const hex = id.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('recipient id must be a UUID');
  return Buffer.from(hex, 'hex');
};

const bytesToUuid = (b: Buffer): string => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const mac = (secret: string, idBytes: Buffer) =>
  base32Encode(hmacSha256(secret, Buffer.concat([Buffer.from('verp:v1:'), idBytes])).subarray(0, 10));

export function encodeVerp(recipientId: string, bounceDomain: string, secret: string): string {
  const idBytes = uuidToBytes(recipientId);
  return `b+${base32Encode(idBytes)}-${mac(secret, idBytes)}@${bounceDomain.toLowerCase()}`;
}

export interface DecodedVerp {
  recipientId: string;
  domain: string;
}

/** Returns null for anything that is not an authentic platform VERP address. */
export function decodeVerp(address: string, secret: string): DecodedVerp | null {
  const m = PATTERN.exec(address.trim().toLowerCase());
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  let idBytes: Buffer;
  try {
    idBytes = base32Decode(m[1]);
  } catch {
    return null;
  }
  if (idBytes.length !== 16) return null;
  if (!safeEqual(mac(secret, idBytes), m[2])) return null;
  return { recipientId: bytesToUuid(idBytes), domain: m[3] };
}

export const looksLikeVerp = (address: string): boolean => PATTERN.test(address.trim().toLowerCase());
