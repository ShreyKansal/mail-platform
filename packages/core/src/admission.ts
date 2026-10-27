import { createHash, randomUUID } from 'node:crypto';
import {
  and,
  eq,
  gt,
  sql,
  emailAttachments,
  emailContents,
  emailIdempotencyKeys,
  emailRecipients,
  emails,
  organizations,
  type DbOrTx,
  type StoredAddress,
} from '@mp/database';
import {
  MAX_ATTACHMENTS_BYTES,
  MAX_RECIPIENTS_PER_EMAIL,
  type SendEmailRequest,
} from '@mp/contracts';
import {
  AddressError,
  domainOf,
  parseMailbox,
  validateCustomHeaders,
  validateSubject,
  type Mailbox,
} from '@mp/mail-protocol';
import { AppError, type ErrorDetail } from '@mp/shared';
import type { Actor } from './audit';
import { findSendingDomain, type DomainRow } from './domains';
import { recordEmailEvent } from './events';
import { findSuppressed } from './suppressions';

export interface AdmissionInput {
  /** Internal admission only; public transactional requests cannot select this stream. */
  stream?: 'transactional' | 'marketing';
  templateVersionId?: string;
  testMode?: boolean;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string;
  html?: string | undefined;
  text?: string | undefined;
  attachments: Array<{ filename: string; contentType?: string | undefined; content: Buffer; contentId?: string | undefined }>;
  headers: Record<string, string>;
  tags: Array<{ name: string; value: string }>;
  metadata: Record<string, string>;
  scheduledAt?: Date | undefined;
}

export interface Sender {
  orgId: string;
  projectId: string;
  actor: Actor;
  source: 'api' | 'smtp';
  apiKeyId?: string | null;
  smtpCredentialId?: string | null;
  restrictDomainId: string | null;
}

export interface AdmissionResult {
  ids: string[];
  replayed: boolean;
}

const asList = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function fromApiRequest(req: SendEmailRequest): AdmissionInput {
  return {
    testMode: req.test_mode ?? false,
    from: req.from,
    to: asList(req.to),
    cc: asList(req.cc),
    bcc: asList(req.bcc),
    replyTo: asList(req.reply_to),
    subject: req.subject ?? '',
    html: req.html,
    text: req.text,
    attachments: (req.attachments ?? []).map((a) => ({
      filename: a.filename,
      contentType: a.content_type,
      contentId: a.content_id,
      content: Buffer.from(a.content ?? '', 'base64'),
    })),
    headers: req.headers ?? {},
    tags: req.tags ?? [],
    metadata: req.metadata ?? {},
    scheduledAt: req.scheduled_at ? new Date(req.scheduled_at) : undefined,
  };
}

/** Executable and script types that are never accepted as attachments. */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'com', 'bat', 'cmd', 'scr', 'pif', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'msi', 'msp', 'jar',
  'ps1', 'psm1', 'hta', 'cpl', 'reg', 'lnk', 'dll', 'iso', 'img', 'vhd', 'vhdx',
]);

const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

interface ValidatedEmail {
  input: AdmissionInput;
  from: Mailbox;
  to: Mailbox[];
  cc: Mailbox[];
  replyTo: Mailbox[];
  recipients: Array<{ kind: 'to' | 'cc' | 'bcc'; address: string }>;
  domain: DomainRow;
  scheduledAt: Date | null;
}

async function validateOne(
  tx: DbOrTx,
  sender: Sender,
  input: AdmissionInput,
  path: string,
  now: Date,
): Promise<ValidatedEmail> {
  const details: ErrorDetail[] = [];
  const parse = (value: string, field: string): Mailbox | null => {
    try {
      return parseMailbox(value);
    } catch (err) {
      if (err instanceof AddressError) {
        details.push({ path: `${path}${field}`, message: err.message });
        return null;
      }
      throw err;
    }
  };

  const from = parse(input.from, 'from');
  const lists = {
    to: input.to.map((a, i) => parse(a, `to[${i}]`)),
    cc: input.cc.map((a, i) => parse(a, `cc[${i}]`)),
    bcc: input.bcc.map((a, i) => parse(a, `bcc[${i}]`)),
  };
  const replyTo = input.replyTo.map((a, i) => parse(a, `reply_to[${i}]`));

  const recipients: ValidatedEmail['recipients'] = [];
  const seen = new Set<string>();
  for (const kind of ['to', 'cc', 'bcc'] as const) {
    for (const mb of lists[kind]) {
      if (!mb) continue;
      const key = mb.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({ kind, address: mb.address });
    }
  }
  if (lists.to.length === 0) details.push({ path: `${path}to`, message: 'at least one "to" recipient is required' });
  if (recipients.length > MAX_RECIPIENTS_PER_EMAIL) {
    details.push({ path: `${path}to`, message: `at most ${MAX_RECIPIENTS_PER_EMAIL} recipients across to, cc and bcc` });
  }

  const subjectIssue = validateSubject(input.subject);
  if (subjectIssue) details.push({ path: `${path}subject`, message: subjectIssue });
  for (const issue of validateCustomHeaders(input.headers)) {
    details.push({ path: `${path}headers.${issue.header}`, message: issue.message });
  }
  if (!input.html && !input.text) details.push({ path: `${path}html`, message: 'provide html, text or both' });

  let attachmentBytes = 0;
  const contentIds = new Set<string>();
  input.attachments.forEach((a, i) => {
    if (a.contentId) {
      if (!/^[A-Za-z0-9._@+-]{1,127}$/.test(a.contentId) || contentIds.has(a.contentId)) {
        details.push({ path: `${path}attachments[${i}].content_id`, message: 'content IDs must be valid and unique within the email' });
      }
      contentIds.add(a.contentId);
    }
    attachmentBytes += a.content.length;
    const ext = a.filename.split('.').pop()?.toLowerCase() ?? '';
    if (BLOCKED_EXTENSIONS.has(ext)) {
      details.push({ path: `${path}attachments[${i}].filename`, message: `.${ext} attachments are not permitted` });
    }
    if (a.content.length === 0) details.push({ path: `${path}attachments[${i}].content`, message: 'attachment is empty' });
  });
  if (attachmentBytes > MAX_ATTACHMENTS_BYTES) {
    details.push({ path: `${path}attachments`, message: `attachments exceed ${MAX_ATTACHMENTS_BYTES / 1024 / 1024} MB in total` });
  }

  let scheduledAt: Date | null = null;
  if (input.scheduledAt) {
    if (Number.isNaN(input.scheduledAt.getTime())) {
      details.push({ path: `${path}scheduled_at`, message: 'invalid date' });
    } else if (input.scheduledAt.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_MS) {
      details.push({ path: `${path}scheduled_at`, message: 'cannot be more than 30 days in the future' });
    } else if (input.scheduledAt.getTime() > now.getTime()) {
      scheduledAt = input.scheduledAt;
    }
  }

  if (details.length) throw new AppError('validation_error', 'the email is invalid', details);

  for (const recipient of recipients) {
    const [scenario, domain] = recipient.address.toLowerCase().split('@');
    const reserved = domain === 'simulate.mail-platform.invalid' || domain?.endsWith('.simulate.mail-platform.invalid');
    if (input.testMode ? !reserved || domain !== 'simulate.mail-platform.invalid' || !['success', 'defer', 'bounce', 'suppress'].includes(scenario!) : reserved) {
      throw new AppError('validation_error', 'test_mode requires only success, defer, bounce or suppress @simulate.mail-platform.invalid; simulator addresses cannot be used in live mode');
    }
  }

  const fromDomain = domainOf(from!.address);
  const domain = await findSendingDomain(tx, sender.orgId, sender.projectId, fromDomain);
  if (!domain) {
    throw new AppError(
      'domain_not_verified',
      `${fromDomain} is not a verified sending domain for this project. Add it under Domains and complete DNS verification.`,
      [{ path: `${path}from`, message: 'unverified sender domain' }],
    );
  }
  if (sender.restrictDomainId && sender.restrictDomainId !== domain.id) {
    throw new AppError('sender_not_authorized', `this credential may not send from ${fromDomain}`, [
      { path: `${path}from`, message: 'domain not permitted for this credential' },
    ]);
  }

  return {
    input,
    from: from!,
    to: lists.to.filter((m): m is Mailbox => !!m),
    cc: lists.cc.filter((m): m is Mailbox => !!m),
    replyTo: replyTo.filter((m): m is Mailbox => !!m),
    recipients,
    domain,
    scheduledAt,
  };
}

/** Enforces org status and sending quotas. Serialized per org with an advisory lock. */
async function enforceQuota(tx: DbOrTx, orgId: string, newRecipients: number, localUnlimited = false): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`quota:${orgId}`}, 0))`);
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new AppError('not_found', 'organization not found');
  if (org.status !== 'active') {
    throw new AppError('account_suspended', org.status === 'suspended' ? 'sending is suspended for this organization' : 'this organization is pending review');
  }
  if (localUnlimited && org.localUnlimitedSending !== false) return;
  const windowCount = async (interval: string) => {
    const [row] = await tx
      .select({ n: sql<number>`coalesce(sum(${emails.recipientCount}), 0)::int` })
      .from(emails)
      .where(and(eq(emails.orgId, orgId), gt(emails.createdAt, sql`now() - ${interval}::interval`)));
    return row?.n ?? 0;
  };
  const day = await windowCount('24 hours');
  if (day + newRecipients > org.dailyRecipientLimit) {
    throw new AppError(
      'quota_exceeded',
      `daily recipient limit reached (${org.dailyRecipientLimit} per 24h on the ${org.sendingTier} tier); contact support to raise it`,
    );
  }
  const minute = await windowCount('1 minute');
  if (minute + newRecipients > org.perMinuteRecipientLimit) {
    throw new AppError('rate_limited', `per-minute recipient limit reached (${org.perMinuteRecipientLimit}/min)`);
  }
}

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/**
 * Durably admits one or more emails (all-or-nothing). When this resolves and
 * the surrounding transaction commits, every recipient is persisted in
 * QUEUED / SCHEDULED / SUPPRESSED state and the dispatcher will pick it up.
 */
export async function admitEmails(
  tx: DbOrTx,
  sender: Sender,
  inputs: AdmissionInput[],
  opts: { idempotencyKey?: string | undefined; requestHash?: string | undefined; now?: Date; localUnlimitedSending?: boolean | undefined } = {},
): Promise<AdmissionResult> {
  const now = opts.now ?? new Date();

  if (opts.idempotencyKey) {
    const key = opts.idempotencyKey;
    const hash = opts.requestHash ?? '';
    await tx
      .delete(emailIdempotencyKeys)
      .where(and(eq(emailIdempotencyKeys.orgId, sender.orgId), eq(emailIdempotencyKeys.key, key), sql`${emailIdempotencyKeys.expiresAt} < now()`));
    const claimed = await tx
      .insert(emailIdempotencyKeys)
      .values({
        orgId: sender.orgId,
        key,
        requestHash: hash,
        response: { pending: true },
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing()
      .returning({ key: emailIdempotencyKeys.key });
    if (claimed.length === 0) {
      const [existing] = await tx
        .select()
        .from(emailIdempotencyKeys)
        .where(and(eq(emailIdempotencyKeys.orgId, sender.orgId), eq(emailIdempotencyKeys.key, key)));
      if (!existing) throw new AppError('conflict', 'idempotency key is being processed; retry shortly');
      if (existing.requestHash !== hash) {
        throw new AppError('idempotency_conflict', 'this idempotency key was already used with a different request body');
      }
      const ids = (existing.response as { ids?: string[] }).ids;
      if (!ids) throw new AppError('conflict', 'idempotency key is being processed; retry shortly');
      return { ids, replayed: true };
    }
  }

  const batch = inputs.length > 1;
  const validated: ValidatedEmail[] = [];
  for (const [i, input] of inputs.entries()) {
    validated.push(await validateOne(tx, sender, input, batch ? `[${i}].` : '', now));
  }

  await enforceQuota(tx, sender.orgId, validated.reduce((n, v) => n + v.recipients.length, 0), opts.localUnlimitedSending);

  const ids: string[] = [];
  for (const v of validated) {
    ids.push(await insertEmail(tx, sender, v, now));
  }

  if (opts.idempotencyKey) {
    await tx
      .update(emailIdempotencyKeys)
      .set({ response: { ids } })
      .where(and(eq(emailIdempotencyKeys.orgId, sender.orgId), eq(emailIdempotencyKeys.key, opts.idempotencyKey)));
  }
  return { ids, replayed: false };
}

const stored = (m: Mailbox): StoredAddress => (m.name ? { address: m.address, name: m.name } : { address: m.address });

async function insertEmail(tx: DbOrTx, sender: Sender, v: ValidatedEmail, now: Date): Promise<string> {
  const emailId = randomUUID();
  const fromDomain = domainOf(v.from.address);
  await tx.insert(emails).values({
    id: emailId,
    orgId: sender.orgId,
    projectId: sender.projectId,
    domainId: v.domain.id,
    source: sender.source,
    stream: v.input.stream ?? 'transactional',
    apiKeyId: sender.apiKeyId ?? null,
    smtpCredentialId: sender.smtpCredentialId ?? null,
    fromAddress: v.from.address,
    fromName: v.from.name ?? null,
    subject: v.input.subject,
    messageId: `${emailId}@${fromDomain}`,
    tags: v.input.tags,
    metadata: v.input.metadata,
    scheduledAt: v.scheduledAt,
    recipientCount: v.recipients.length,
    isTest: v.input.testMode ?? false,
    templateVersionId: v.input.templateVersionId ?? null,
    createdAt: now,
  });
  await tx.insert(emailContents).values({
    emailId,
    orgId: sender.orgId,
    html: v.input.html ?? null,
    text: v.input.text ?? null,
    replyTo: v.replyTo.map(stored),
    toHeader: v.to.map(stored),
    ccHeader: v.cc.map(stored),
    headers: v.input.headers,
  });
  if (v.input.attachments.length) {
    await tx.insert(emailAttachments).values(
      v.input.attachments.map((a) => ({
        orgId: sender.orgId,
        emailId,
        filename: a.filename,
        contentType: a.contentType ?? 'application/octet-stream',
        sizeBytes: a.content.length,
        sha256: createHash('sha256').update(a.content).digest('hex'),
        contentBase64: a.content.toString('base64'),
        contentId: a.contentId ?? null,
      })),
    );
  }

  const suppressed = v.input.testMode ? new Set<string>() : await findSuppressed(
    tx,
    sender.orgId,
    v.recipients.map((r) => r.address.toLowerCase()),
  );
  const pendingState: 'SCHEDULED' | 'QUEUED' = v.scheduledAt ? 'SCHEDULED' : 'QUEUED';
  const rows = await tx
    .insert(emailRecipients)
    .values(
      v.recipients.map((r) => ({
        orgId: sender.orgId,
        emailId,
        kind: r.kind,
        address: r.address,
        addressLower: r.address.toLowerCase(),
        stream: v.input.stream ?? 'transactional',
        state: suppressed.has(r.address.toLowerCase()) ? ('SUPPRESSED' as const) : pendingState,
        nextAttemptAt: v.scheduledAt ?? now,
        createdAt: now,
      })),
    )
    .returning({ id: emailRecipients.id, state: emailRecipients.state, address: emailRecipients.address });

  await recordEmailEvent(tx, {
    orgId: sender.orgId,
    projectId: sender.projectId,
    emailId,
    recipientId: null,
    type: 'email.accepted',
    data: { from: v.from.address, subject: v.input.subject, recipients: rows.length, source: sender.source },
    dedupeKey: `${emailId}:accepted`,
    occurredAt: now,
  });
  if (v.scheduledAt) {
    await recordEmailEvent(tx, {
      orgId: sender.orgId,
      projectId: sender.projectId,
      emailId,
      recipientId: null,
      type: 'email.scheduled',
      data: { scheduled_at: v.scheduledAt.toISOString() },
      dedupeKey: `${emailId}:scheduled`,
      occurredAt: now,
    });
  }
  for (const r of rows.filter((x) => x.state === 'SUPPRESSED')) {
    await recordEmailEvent(tx, {
      orgId: sender.orgId,
      projectId: sender.projectId,
      emailId,
      recipientId: r.id,
      type: 'email.suppressed',
      data: { to: r.address, state: 'SUPPRESSED', reason: 'address is on the suppression list' },
      dedupeKey: `${r.id}:SUPPRESSED:admission`,
      occurredAt: now,
    });
  }
  return emailId;
}
