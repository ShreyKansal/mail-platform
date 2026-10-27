import { hash, verify } from '@node-rs/argon2';

// OWASP Password Storage Cheat Sheet baseline for Argon2id.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

/** Used when the account does not exist, so response timing does not reveal it. */
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) {
    dummyHash ??= hash('timing-equalization-placeholder', OPTIONS);
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}
