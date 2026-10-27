import {
  and,
  asc,
  desc,
  dkimKeys,
  dnsRecords,
  domains,
  emails,
  eq,
  inArray,
  isNotNull,
  isUniqueViolation,
  projects,
  sql,
  type DbOrTx,
} from '@mp/database';
import {
  checkRecord,
  expectedRecords,
  type RecordCheck,
  type RecordPurpose,
  type VerifyContext,
} from '@mp/dns-verification';
import { AddressError, dkimTxtValue, generateDkimKey, normalizeDomain } from '@mp/mail-protocol';
import { AppError, randomToken } from '@mp/shared';
import type { CoreConfig } from './config';
import { deterministicUuid, enqueueWebhooks } from './events';
import { writeAudit, type Actor } from './audit';

export type DomainRow = typeof domains.$inferSelect;
export type DnsRecordRow = typeof dnsRecords.$inferSelect;

const DKIM_AAD = (domainId: string) => `dkim:${domainId}`;

export interface CreateDomainInput {
  orgId: string;
  projectId: string;
  name: string;
  returnPathLabel: string;
  actor: Actor;
}

export async function createDomain(tx: DbOrTx, cfg: CoreConfig, input: CreateDomainInput): Promise<DomainRow> {
  let name: string;
  try {
    name = normalizeDomain(input.name);
  } catch (err) {
    if (err instanceof AddressError) throw new AppError('validation_error', err.message, [{ path: 'name', message: err.message }]);
    throw err;
  }
  if (name.endsWith(`.${cfg.platform.bounceDomain}`) || name === cfg.platform.bounceDomain) {
    throw new AppError('validation_error', 'platform-owned domains cannot be added');
  }

  const [project] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId));
  if (!project) throw new AppError('not_found', 'project not found');

  const key = generateDkimKey(2048);
  let domain: DomainRow;
  try {
    [domain] = (await tx
      .insert(domains)
      .values({
        orgId: input.orgId,
        projectId: input.projectId,
        name,
        ownershipToken: randomToken(20),
        returnPathLabel: input.returnPathLabel,
      })
      .returning()) as [DomainRow];
  } catch (err) {
    if (isUniqueViolation(err, 'domains_org_name_uq')) throw new AppError('conflict', `${name} has already been added to this organization`);
    throw err;
  }

  await tx.insert(dkimKeys).values({
    orgId: input.orgId,
    domainId: domain.id,
    selector: key.selector,
    keyBits: key.bits,
    publicKey: key.publicKeyBase64,
    privateKeySealed: cfg.secrets.seal(key.privateKeyPem, DKIM_AAD(domain.id)),
    status: 'pending',
  });

  const records = expectedRecords({
    domain: name,
    ownershipToken: domain.ownershipToken,
    dkimSelector: key.selector,
    dkimTxtValue: dkimTxtValue(key.publicKeyBase64),
    returnPathLabel: input.returnPathLabel,
    platform: cfg.platform,
  });
  await tx.insert(dnsRecords).values(
    records.map((r) => ({
      orgId: input.orgId,
      domainId: domain.id,
      purpose: r.purpose,
      type: r.type,
      host: r.host,
      value: r.value,
      priority: r.priority,
      required: r.required,
    })),
  );
  await writeAudit(tx, { orgId: input.orgId, actor: input.actor, action: 'domain.created', targetType: 'domain', targetId: domain.id, metadata: { name } });
  return domain;
}

export interface DomainWithRecords {
  domain: DomainRow;
  records: DnsRecordRow[];
  dkimSelector: string | null;
}

export async function loadDomain(tx: DbOrTx, orgId: string, domainId: string): Promise<DomainWithRecords> {
  const [domain] = await tx.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.orgId, orgId)));
  if (!domain) throw new AppError('not_found', 'domain not found');
  const records = await tx
    .select()
    .from(dnsRecords)
    .where(eq(dnsRecords.domainId, domainId))
    .orderBy(asc(dnsRecords.createdAt), asc(dnsRecords.purpose));
  const [key] = await tx
    .select({ selector: dkimKeys.selector })
    .from(dkimKeys)
    .where(and(eq(dkimKeys.domainId, domainId), inArray(dkimKeys.status, ['pending', 'active'])))
    .orderBy(sql`case when ${dkimKeys.status} = 'active' then 0 else 1 end`, desc(dkimKeys.createdAt))
    .limit(1);
  return { domain, records, dkimSelector: key?.selector ?? null };
}

export async function listDomains(tx: DbOrTx, orgId: string, projectId: string): Promise<DomainWithRecords[]> {
  const rows = await tx
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.orgId, orgId), eq(domains.projectId, projectId)))
    .orderBy(desc(domains.createdAt));
  return Promise.all(rows.map((r) => loadDomain(tx, orgId, r.id)));
}

const VERIFICATION_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface VerificationOutcome {
  status: DomainRow['status'];
  sendingEnabled: boolean;
  changed: boolean;
  checks: Record<RecordPurpose, RecordCheck>;
}

/** Next scheduled re-check: fast while pending, slow once verified (drift detection). */
export function nextCheckDelayMs(status: DomainRow['status'], ageMs: number): number {
  if (status === 'verified') return 6 * 60 * 60 * 1000;
  if (status === 'failed' || status === 'disabled') return 24 * 60 * 60 * 1000;
  if (ageMs < 60 * 60 * 1000) return 2 * 60 * 1000;
  return 15 * 60 * 1000;
}

export type DomainChecks = Record<RecordPurpose, RecordCheck>;

/**
 * Performs the DNS lookups for a domain's expected records. Runs outside any
 * database transaction so slow resolvers never hold connections or locks.
 */
export async function checkDomainRecords(records: DnsRecordRow[], dns: VerifyContext): Promise<DomainChecks> {
  const entries = await Promise.all(
    records.map(async (rec) => {
      const result = await checkRecord(
        { purpose: rec.purpose, type: rec.type as 'TXT' | 'MX', host: rec.host, value: rec.value, priority: rec.priority, required: rec.required },
        dns,
      );
      return [rec.purpose, result] as const;
    }),
  );
  return Object.fromEntries(entries) as DomainChecks;
}

/**
 * Applies check results to a domain. Temporary DNS failures never downgrade
 * a verified domain.
 *
 * Sending requires: ownership TXT valid AND DKIM key valid.
 * A custom Return-Path is used only when its MX and SPF are both valid; until
 * then mail uses the platform bounce domain (DMARC still aligns via DKIM).
 */
export async function applyDomainChecks(
  tx: DbOrTx,
  orgId: string,
  domainId: string,
  checks: DomainChecks,
  now = new Date(),
  expectedDkimHost?: string,
): Promise<VerificationOutcome> {
  await tx.select({ id: domains.id }).from(domains).where(and(eq(domains.id, domainId), eq(domains.orgId, orgId))).for('update');
  const { domain, records } = await loadDomain(tx, orgId, domainId);
  if (expectedDkimHost && records.find((record) => record.purpose === 'dkim')?.host !== expectedDkimHost) throw new AppError('conflict', 'DKIM configuration changed during DNS checking; retry');
  if (domain.status === 'disabled') throw new AppError('invalid_state', 'domain is disabled');

  for (const rec of records) {
    const result = checks[rec.purpose];
    if (!result) continue;
    await tx
      .update(dnsRecords)
      .set({ status: result.status, observed: result.observed, detail: result.detail, checkedAt: now })
      .where(eq(dnsRecords.id, rec.id));
  }

  const ok = (p: RecordPurpose) => checks[p]?.status === 'valid';
  const definitiveFailure = (p: RecordPurpose) =>
    ['missing', 'invalid', 'conflict'].includes(checks[p]?.status ?? '');

  const ownershipValid = ok('ownership');
  const dkimValid = ok('dkim');
  const returnPathValid = ok('return_path_mx') && ok('return_path_spf');

  let status = domain.status;
  let sendingEnabled = domain.sendingEnabled;
  let ownershipVerifiedAt = domain.ownershipVerifiedAt;

  if (ownershipValid && dkimValid) {
    status = 'verified';
    sendingEnabled = true;
    ownershipVerifiedAt ??= now;
  } else if (domain.status === 'verified') {
    // Drift: only a definitive failure of a required record revokes sending.
    if (definitiveFailure('ownership') || definitiveFailure('dkim')) {
      status = 'failed';
      sendingEnabled = false;
    }
  } else if (now.getTime() - domain.createdAt.getTime() > VERIFICATION_WINDOW_MS) {
    status = 'failed';
  }

  const changed = status !== domain.status || sendingEnabled !== domain.sendingEnabled;
  try {
    await tx
      .update(domains)
      .set({
        status,
        sendingEnabled,
        ownershipVerifiedAt,
        returnPathVerifiedAt: returnPathValid ? (domain.returnPathVerifiedAt ?? now) : null,
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + nextCheckDelayMs(status, now.getTime() - domain.createdAt.getTime())),
        checkLeaseUntil: null,
        updatedAt: now,
      })
      .where(eq(domains.id, domainId));
  } catch (err) {
    if (isUniqueViolation(err, 'domains_verified_name_uq')) {
      throw new AppError('conflict', `${domain.name} is already verified by another account. Contact support if you control this domain.`);
    }
    throw err;
  }

  if (status === 'verified' && domain.status !== 'verified') {
    await tx
      .update(dkimKeys)
      .set({ status: 'active', activatedAt: now })
      .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'pending'), sql`${dkimKeys.selector} || '._domainkey.' || ${domain.name} = ${records.find((record) => record.purpose === 'dkim')!.host}`));
  }

  if (changed && (status === 'verified' || domain.status === 'verified')) {
    const type = status === 'verified' ? 'domain.verified' : 'domain.verification_lost';
    await enqueueWebhooks(tx, {
      orgId,
      projectId: domain.projectId,
      eventId: deterministicUuid(`${type}:${domainId}:${now.toISOString()}`),
      type,
      createdAt: now,
      data: { domain_id: domainId, name: domain.name, status, sending_enabled: sendingEnabled },
    });
    await writeAudit(tx, { orgId, actor: { type: 'system', id: null }, action: type, targetType: 'domain', targetId: domainId, metadata: { name: domain.name } });
  }

  return { status, sendingEnabled, changed, checks };
}

/**
 * Disables a domain. Rows referenced by historical emails are kept (delivery
 * records stay auditable); otherwise the domain and its keys are removed.
 */
export async function removeDomain(tx: DbOrTx, orgId: string, domainId: string, actor: Actor): Promise<'deleted' | 'disabled'> {
  const { domain } = await loadDomain(tx, orgId, domainId);
  const [used] = await tx.select({ n: sql<number>`count(*)::int` }).from(emails).where(eq(emails.domainId, domainId));
  if ((used?.n ?? 0) > 0) {
    await tx
      .update(domains)
      .set({ status: 'disabled', sendingEnabled: false, ownershipVerifiedAt: null, updatedAt: new Date() })
      .where(eq(domains.id, domainId));
    await tx.update(dkimKeys).set({ status: 'retired', retiredAt: new Date() }).where(eq(dkimKeys.domainId, domainId));
    await writeAudit(tx, { orgId, actor, action: 'domain.disabled', targetType: 'domain', targetId: domainId, metadata: { name: domain.name } });
    return 'disabled';
  }
  await tx.delete(domains).where(eq(domains.id, domainId));
  await writeAudit(tx, { orgId, actor, action: 'domain.deleted', targetType: 'domain', targetId: domainId, metadata: { name: domain.name } });
  return 'deleted';
}

export interface SendingIdentity {
  domain: DomainRow;
  dkim: { selector: string; privateKeyPem: string };
  /** Envelope (Return-Path) domain: custom when verified, otherwise the platform's. */
  returnPathDomain: string;
}

/** Resolves the signing identity for a domain at dispatch time. Service-role use only. */
export async function loadSendingIdentity(tx: DbOrTx, cfg: CoreConfig, domainId: string): Promise<SendingIdentity> {
  const [domain] = await tx.select().from(domains).where(eq(domains.id, domainId));
  if (!domain) throw new Error(`domain ${domainId} not found`);
  const [key] = await tx
    .select()
    .from(dkimKeys)
    .where(and(eq(dkimKeys.domainId, domainId), eq(dkimKeys.status, 'active')))
    .orderBy(desc(dkimKeys.activatedAt))
    .limit(1);
  if (!key) throw new Error(`domain ${domainId} has no active DKIM key`);
  return {
    domain,
    dkim: { selector: key.selector, privateKeyPem: cfg.secrets.open(key.privateKeySealed, DKIM_AAD(domain.id)) },
    returnPathDomain: domain.returnPathVerifiedAt ? `${domain.returnPathLabel}.${domain.name}` : cfg.platform.bounceDomain,
  };
}

/** Finds the verified domain (exact or closest parent) that may send as `fromDomain`. */
export async function findSendingDomain(tx: DbOrTx, orgId: string, projectId: string, fromDomain: string): Promise<DomainRow | null> {
  const labels = fromDomain.split('.');
  const candidates = labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'));
  const rows = await tx
    .select()
    .from(domains)
    .where(
      and(
        eq(domains.orgId, orgId),
        eq(domains.projectId, projectId),
        inArray(domains.name, candidates),
        eq(domains.sendingEnabled, true),
        eq(domains.status, 'verified'),
        isNotNull(domains.ownershipVerifiedAt),
      ),
    );
  rows.sort((a, b) => b.name.length - a.name.length);
  return rows[0] ?? null;
}
