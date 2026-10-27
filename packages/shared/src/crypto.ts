import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 4648 base32, lowercase, no padding. Safe for DNS labels and email local parts. */
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const s = input.toLowerCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const randomToken = (bytes = 32): string => base32Encode(randomBytes(bytes));

export const sha256Hex = (input: string | Buffer): string => createHash('sha256').update(input).digest('hex');

export const hmacSha256 = (key: string | Buffer, data: string | Buffer): Buffer =>
  createHmac('sha256', key).update(data).digest();

export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ab = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Envelope encryption for secrets at rest (DKIM private keys, webhook secrets).
 *
 * Format: `v1.<keyId>.<base64url(iv | tag | ciphertext)>` using AES-256-GCM.
 * The key provider abstraction lets production plug in a KMS/Vault-backed
 * implementation; the env-backed provider is for local and single-node use.
 */
export interface KeyProvider {
  currentKeyId(): string;
  getKey(keyId: string): Buffer;
}

export class StaticKeyProvider implements KeyProvider {
  private readonly keys: Map<string, Buffer>;
  private readonly current: string;

  /** @param spec `keyId:base64key[,keyId:base64key...]`; the first entry encrypts new data. */
  constructor(spec: string) {
    this.keys = new Map();
    const entries = spec.split(',').map((s) => s.trim()).filter(Boolean);
    for (const entry of entries) {
      const sep = entry.indexOf(':');
      if (sep <= 0) throw new Error('encryption key spec must be keyId:base64key');
      const id = entry.slice(0, sep);
      const key = Buffer.from(entry.slice(sep + 1), 'base64');
      if (key.length !== 32) throw new Error(`encryption key ${id} must be 32 bytes`);
      if (!/^[a-z0-9-]{1,32}$/.test(id)) throw new Error(`invalid encryption key id ${id}`);
      this.keys.set(id, key);
    }
    const first = entries[0];
    if (!first) throw new Error('at least one encryption key is required');
    this.current = first.slice(0, first.indexOf(':'));
  }

  currentKeyId() {
    return this.current;
  }

  getKey(keyId: string) {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`unknown encryption key id ${keyId}`);
    return key;
  }
}

export class SecretBox {
  constructor(private readonly keys: KeyProvider) {}

  seal(plaintext: string, aad = ''): string {
    const keyId = this.keys.currentKeyId();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.getKey(keyId), iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${keyId}.${Buffer.concat([iv, tag, ct]).toString('base64url')}`;
  }

  open(sealed: string, aad = ''): string {
    const [version, keyId, payload] = sealed.split('.');
    if (version !== 'v1' || !keyId || !payload) throw new Error('unsupported sealed secret format');
    const raw = Buffer.from(payload, 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.keys.getKey(keyId), iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
