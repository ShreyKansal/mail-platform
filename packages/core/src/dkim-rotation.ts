import { and, asc, dkimKeys, dnsRecords, domains, eq, inArray, sql, type Tx } from '@mp/database';
import { dkimTxtValue, generateDkimKey } from '@mp/mail-protocol';
import { AppError } from '@mp/shared';
import { writeAudit, type Actor } from './audit';
import type { CoreConfig } from './config';

export const DKIM_OVERLAP_MS = 7 * 86400_000;
export const keyView = (key: typeof dkimKeys.$inferSelect, domain: string) => ({
  id: key.id, selector: key.selector, status: key.status, retire_after: key.retireAfter?.toISOString() ?? null,
  created_at: key.createdAt.toISOString(), record: { type: 'TXT' as const, host: `${key.selector}._domainkey.${domain}`, value: dkimTxtValue(key.publicKey) },
});

export async function startDkimRotation(tx: Tx, config: CoreConfig, orgId: string, projectId: string, domainId: string, actor: Actor) {
  const [domain] = await tx.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.orgId, orgId), eq(domains.projectId, projectId))).for('update');
  if (!domain) throw new AppError('not_found', 'domain not found');
  if (!domain.sendingEnabled || domain.status !== 'verified') throw new AppError('invalid_state', 'verify the domain before rotating DKIM');
  const unfinished = await tx.select({ id: dkimKeys.id }).from(dkimKeys).where(and(eq(dkimKeys.domainId, domainId), inArray(dkimKeys.status, ['pending', 'retiring'])));
  if (unfinished.length) throw new AppError('conflict', 'a DKIM rotation or overlap is already in progress');
  const key = generateDkimKey();
  const [inserted] = await tx.insert(dkimKeys).values({ orgId, domainId, selector: key.selector, keyBits: key.bits, publicKey: key.publicKeyBase64,
    privateKeySealed: config.secrets.seal(key.privateKeyPem, `dkim:${domainId}`), status: 'pending' }).returning();
  await writeAudit(tx, { orgId, actor, action: 'domain.dkim_rotation_started', targetType: 'domain', targetId: domainId, metadata: { selector: key.selector } });
  return keyView(inserted!, domain.name);
}

/** The caller verifies this exact key's DNS outside the transaction before entering here. */
export async function activateDkimRotation(tx: Tx, orgId: string, projectId: string, domainId: string, keyId: string, actor: Actor, now = new Date()) {
  const [domain] = await tx.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.orgId, orgId), eq(domains.projectId, projectId))).for('update');
  if (!domain) throw new AppError('not_found', 'domain not found');
  if (!domain.sendingEnabled || domain.status !== 'verified') throw new AppError('invalid_state', 'domain is not permitted to send');
  const [key] = await tx.select().from(dkimKeys).where(and(eq(dkimKeys.id, keyId), eq(dkimKeys.domainId, domainId))).for('update');
  if (!key) throw new AppError('not_found', 'DKIM key not found');
  if (key.status === 'active') return keyView(key, domain.name);
  if (key.status !== 'pending') throw new AppError('invalid_state', 'only a pending key can be activated');
  await tx.update(dkimKeys).set({ status: 'retiring', retireAfter: new Date(now.getTime() + DKIM_OVERLAP_MS) }).where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'active')));
  const [active] = await tx.update(dkimKeys).set({ status: 'active', activatedAt: now }).where(eq(dkimKeys.id, key.id)).returning();
  await tx.update(dnsRecords).set({ host: `${key.selector}._domainkey.${domain.name}`, value: dkimTxtValue(key.publicKey), status: 'valid', checkedAt: now, observed: [dkimTxtValue(key.publicKey)], detail: 'DKIM rotation verified' })
    .where(and(eq(dnsRecords.domainId, domainId), eq(dnsRecords.purpose, 'dkim')));
  await writeAudit(tx, { orgId, actor, action: 'domain.dkim_rotated', targetType: 'domain', targetId: domainId, metadata: { selector: key.selector, overlap_days: 7 } });
  return keyView(active!, domain.name);
}

export async function retireDkimKeys(tx: Tx, now = new Date()): Promise<number> {
  const due = await tx.select().from(dkimKeys).where(and(eq(dkimKeys.status, 'retiring'), sql`${dkimKeys.retireAfter} <= ${now.toISOString()}::timestamptz`)).orderBy(asc(dkimKeys.id)).limit(100).for('update', { skipLocked: true });
  for (const key of due) {
    await tx.update(dkimKeys).set({ status: 'retired', retiredAt: now }).where(eq(dkimKeys.id, key.id));
    await writeAudit(tx, { orgId: key.orgId, actor: { type: 'system', id: null }, action: 'domain.dkim_retired', targetType: 'domain', targetId: key.domainId, metadata: { selector: key.selector } });
  }
  return due.length;
}
