import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, SecretBox, StaticKeyProvider } from './crypto';

const key = () => randomBytes(32).toString('base64');

describe('base32', () => {
  it('round-trips arbitrary bytes and uses only DNS/local-part safe characters', () => {
    for (let n = 0; n < 40; n++) {
      const buf = randomBytes(n);
      const enc = base32Encode(buf);
      expect(enc).toMatch(/^[a-z2-7]*$/);
      expect(base32Decode(enc).equals(buf)).toBe(true);
    }
    expect(() => base32Decode('abc1')).toThrow();
  });
});

describe('SecretBox', () => {
  it('encrypts with the first key and decrypts with any configured key (rotation)', () => {
    const oldSpec = `old:${key()}`;
    const sealedWithOld = new SecretBox(new StaticKeyProvider(oldSpec)).seal('dkim-private-key', 'dkim:d1');
    const rotated = new SecretBox(new StaticKeyProvider(`new:${key()},${oldSpec}`));
    expect(rotated.open(sealedWithOld, 'dkim:d1')).toBe('dkim-private-key');
    expect(rotated.seal('x').startsWith('v1.new.')).toBe(true);
  });

  it('binds ciphertext to its associated data and detects tampering', () => {
    const box = new SecretBox(new StaticKeyProvider(`k:${key()}`));
    const sealed = box.seal('secret', 'webhook:a');
    expect(() => box.open(sealed, 'webhook:b')).toThrow();
    const parts = sealed.split('.');
    const raw = Buffer.from(parts[2]!, 'base64url');
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    expect(() => box.open(`${parts[0]}.${parts[1]}.${raw.toString('base64url')}`, 'webhook:a')).toThrow();
  });

  it('produces different ciphertexts for the same plaintext', () => {
    const box = new SecretBox(new StaticKeyProvider(`k:${key()}`));
    expect(box.seal('same')).not.toBe(box.seal('same'));
  });

  it('rejects malformed key specifications', () => {
    expect(() => new StaticKeyProvider('nokey')).toThrow();
    expect(() => new StaticKeyProvider(`k:${randomBytes(16).toString('base64')}`)).toThrow(/32 bytes/);
    expect(() => new StaticKeyProvider(`BAD ID:${key()}`)).toThrow();
  });
});
