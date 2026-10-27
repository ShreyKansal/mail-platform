import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  batchSendRequest,
  batchSendResponse,
  emailDetailView,
  emailSummaryView,
  listEmailsQuery,
  listOf,
  sendEmailRequest,
  sendEmailResponse,
  rescheduleEmailRequest,
  uuidParam,
} from '@mp/contracts';
import { admitEmails, hashRequest, prepareApiEmails, resolveEmailTemplates, rescheduleEmail, transitionRecipient, type Sender } from '@mp/core';
import {
  and,
  asc,
  desc,
  emailContents,
  emailAttachments,
  emailIdempotencyKeys,
  emailEvents,
  emailRecipients,
  emails,
  eq,
  inArray,
  sql,
  type Tx,
} from '@mp/database';
import { aggregateStatus, DISPATCHABLE_STATES, type RecipientState } from '@mp/mail-protocol';
import { metrics } from '@mp/observability';
import { AppError, csvDocument, isAppError } from '@mp/shared';
import { principalOf, type AppDeps, type Principal } from '../context';
import { decodeCursor, page } from '../views';

const IDEMPOTENCY_HEADER = 'idempotency-key';

function senderOf(p: Principal): Sender {
  return p.kind === 'api_key'
    ? { orgId: p.orgId, projectId: p.projectId, actor: { type: 'api_key', id: p.keyId }, source: 'api', apiKeyId: p.keyId, restrictDomainId: p.restrictDomainId }
    : { orgId: p.orgId, projectId: p.projectId, actor: { type: 'user', id: p.userId }, source: 'api', restrictDomainId: null };
}

function idempotencyKey(header: unknown, body?: string): string | undefined {
  const h = typeof header === 'string' ? header : undefined;
  const key = h ?? body;
  if (key !== undefined && (key.length === 0 || key.length > 256)) {
    throw new AppError('validation_error', 'Idempotency-Key must be 1-256 characters');
  }
  return key;
}

function countRejection(err: unknown): never {
  if (isAppError(err)) {
    if (err.code === 'quota_exceeded' || err.code === 'rate_limited') metrics.tenantLimitExceeded.inc({ kind: err.code });
    metrics.rejected.inc({ reason: err.code });
  }
  throw err;
}

async function summaries(tx: Tx, rows: Array<typeof emails.$inferSelect>) {
  const ids = rows.map((r) => r.id);
  const recipients = ids.length
    ? await tx
        .select({ emailId: emailRecipients.emailId, state: emailRecipients.state, address: emailRecipients.address, kind: emailRecipients.kind })
        .from(emailRecipients)
        .where(inArray(emailRecipients.emailId, ids))
    : [];
  return rows.map((e) => {
    const rs = recipients.filter((r) => r.emailId === e.id);
    return {
      id: e.id,
      from: e.fromName ? `${e.fromName} <${e.fromAddress}>` : e.fromAddress,
      subject: e.subject,
      to: rs.filter((r) => r.kind === 'to').map((r) => r.address),
      status: aggregateStatus(rs.map((r) => r.state as RecipientState)),
      source: e.source,
      test_mode: e.isTest,
      tags: e.tags,
      scheduled_at: e.scheduledAt?.toISOString() ?? null,
      created_at: e.createdAt.toISOString(),
    };
  });
}

export function emailRoutes(app: FastifyInstance, _deps: AppDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Emails'];
  r.get('/v1/emails/export', {
    config: { permission: 'org:manage', sessionOnly: true },
    schema: { tags, summary: 'Export up to 1,000 filtered emails as CSV', querystring: listEmailsQuery.omit({ limit: true, cursor: true }) },
  }, async (req, reply) => {
    const p = principalOf(req.principal);
    const data = await req.tenant(async (tx) => {
      const rows = await tx.select().from(emails).where(and(eq(emails.orgId, p.orgId), eq(emails.projectId, p.projectId),
        req.query.created_after ? sql`${emails.createdAt} >= ${req.query.created_after}::timestamptz` : undefined,
        req.query.created_before ? sql`${emails.createdAt} < ${req.query.created_before}::timestamptz` : undefined,
        req.query.api_key_id ? eq(emails.apiKeyId, req.query.api_key_id) : undefined,
        req.query.source ? eq(emails.source, req.query.source) : undefined,
        req.query.test_mode !== undefined ? eq(emails.isTest, req.query.test_mode === 'true') : undefined,
        req.query.search ? sql`(strpos(lower(${emails.subject}), lower(${req.query.search})) > 0 or strpos(lower(${emails.fromAddress}), lower(${req.query.search})) > 0 or exists (select 1 from ${emailRecipients} where ${emailRecipients.emailId} = ${emails.id} and strpos(lower(${emailRecipients.address}), lower(${req.query.search})) > 0))` : undefined,
        req.query.status ? sql`exists (select 1 from ${emailRecipients} where ${emailRecipients.emailId} = ${emails.id} and ${emailRecipients.state} = ${req.query.status})` : undefined,
      )).orderBy(desc(emails.createdAt), desc(emails.id)).limit(1001);
      if (rows.length > 1000) throw new AppError('validation_error', 'export exceeds 1,000 emails; narrow the date range or filters');
      return summaries(tx, rows);
    });
    return reply.header('content-disposition', 'attachment; filename="emails.csv"').type('text/csv; charset=utf-8')
      .send(csvDocument([['ID', 'From', 'To', 'Subject', 'Status', 'Source', 'Created', 'Scheduled', 'Test mode'], ...data.map((e) => [e.id, e.from, e.to.join('; '), e.subject, e.status, e.source, e.created_at, e.scheduled_at, e.test_mode])]));
  });
  const replayIfPresent = async (tx: Tx, orgId: string, key: string | undefined, requestHash: string) => {
    if (!key) return null;
    const [row] = await tx.select().from(emailIdempotencyKeys).where(and(eq(emailIdempotencyKeys.orgId, orgId), eq(emailIdempotencyKeys.key, key), sql`${emailIdempotencyKeys.expiresAt} > now()`));
    if (!row) return null;
    if (row.requestHash !== requestHash) throw new AppError('idempotency_conflict', 'this idempotency key was already used with a different request body');
    const ids = (row.response as { ids?: string[] }).ids;
    if (!ids) throw new AppError('conflict', 'idempotency key is being processed; retry shortly');
    return { ids, replayed: true };
  };
  const attachmentView = z.object({ id: z.string().uuid(), filename: z.string(), content_type: z.string(), content_id: z.string().nullable(), size_bytes: z.number(), sha256: z.string() });
  const attachmentParams = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });
  const viewAttachment = (a: typeof emailAttachments.$inferSelect) => ({ id: a.id, filename: a.filename, content_type: a.contentType, content_id: a.contentId, size_bytes: a.sizeBytes, sha256: a.sha256 });

  r.get('/v1/emails/:id/attachments', {
    config: { permission: 'emails:read_content' },
    schema: { tags, summary: 'List email attachments', params: uuidParam, response: { 200: z.object({ data: z.array(attachmentView) }) } },
  }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [email] = await tx.select({ id: emails.id }).from(emails).where(and(eq(emails.id, req.params.id), eq(emails.orgId, p.orgId), eq(emails.projectId, p.projectId)));
      if (!email) throw new AppError('not_found', 'email not found');
      const rows = await tx.select().from(emailAttachments).where(eq(emailAttachments.emailId, email.id));
      return { data: rows.map(viewAttachment) };
    });
  });
  r.get('/v1/emails/:id/attachments/:attachmentId', {
    config: { permission: 'emails:read_content' },
    schema: { tags, summary: 'Retrieve email attachment content', params: attachmentParams, response: { 200: attachmentView.extend({ content: z.string() }) } },
  }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [row] = await tx.select({ attachment: emailAttachments }).from(emailAttachments).innerJoin(emails, eq(emails.id, emailAttachments.emailId))
        .where(and(eq(emailAttachments.id, req.params.attachmentId), eq(emails.id, req.params.id), eq(emails.orgId, p.orgId), eq(emails.projectId, p.projectId)));
      if (!row) throw new AppError('not_found', 'attachment not found');
      return { ...viewAttachment(row.attachment), content: row.attachment.contentBase64 };
    });
  });

  r.post(
    '/v1/emails',
    {
      bodyLimit: 16 * 1024 * 1024,
      config: { permission: 'emails:send' },
      schema: {
        tags,
        summary: 'Send an email',
        description:
          'Durably accepts the email for delivery. A 202 means the message is persisted and queued, not that it was delivered. ' +
          'Track delivery through GET /v1/emails/{id} or webhooks.',
        body: sendEmailRequest,
        response: { 202: sendEmailResponse },
      },
    },
    async (req, reply) => {
      const p = principalOf(req.principal);
      const key = idempotencyKey(req.headers[IDEMPOTENCY_HEADER], req.body.idempotency_key);
      const requestHash = hashRequest(req.body);
      const replay = await req.tenant((tx) => replayIfPresent(tx, p.orgId, key, requestHash));
      const resolved = replay ? [] : await req.tenant(tx => resolveEmailTemplates(tx, p.orgId, p.projectId, [req.body]));
      const inputs = replay ? [] : await prepareApiEmails(resolved.map(r => r.request));
      inputs.forEach((input, i) => { if (resolved[i]?.versionId) input.templateVersionId = resolved[i]!.versionId!; });
      const result = replay ?? await req
        .tenant((tx) =>
          admitEmails(tx, senderOf(p), inputs, { idempotencyKey: key, requestHash, localUnlimitedSending: _deps.core.localUnlimitedSending }),
        )
        .catch(countRejection);
      if (!result.replayed) metrics.emailAccepted.inc({ source: 'api' });
      if (result.replayed) reply.header('idempotent-replayed', 'true');
      return reply.status(202).send({ id: result.ids[0]! });
    },
  );

  r.post(
    '/v1/emails/batch',
    {
      bodyLimit: 32 * 1024 * 1024,
      config: { permission: 'emails:send' },
      schema: {
        tags,
        summary: 'Send up to 100 emails atomically',
        description: 'Either every email in the batch is accepted or none is.',
        body: batchSendRequest,
        response: { 202: batchSendResponse },
      },
    },
    async (req, reply) => {
      const p = principalOf(req.principal);
      const key = idempotencyKey(req.headers[IDEMPOTENCY_HEADER]);
      const requestHash = hashRequest(req.body);
      const replay = await req.tenant((tx) => replayIfPresent(tx, p.orgId, key, requestHash));
      const resolved = replay ? [] : await req.tenant(tx => resolveEmailTemplates(tx, p.orgId, p.projectId, req.body));
      const inputs = replay ? [] : await prepareApiEmails(resolved.map(r => r.request));
      inputs.forEach((input, i) => { if (resolved[i]?.versionId) input.templateVersionId = resolved[i]!.versionId!; });
      const result = replay ?? await req
        .tenant((tx) => admitEmails(tx, senderOf(p), inputs, { idempotencyKey: key, requestHash, localUnlimitedSending: _deps.core.localUnlimitedSending }))
        .catch(countRejection);
      if (!result.replayed) metrics.emailAccepted.inc({ source: 'api' }, result.ids.length);
      if (result.replayed) reply.header('idempotent-replayed', 'true');
      return reply.status(202).send({ data: result.ids.map((id) => ({ id })) });
    },
  );

  r.get(
    '/v1/emails',
    {
      config: { permission: 'emails:read' },
      schema: { tags, summary: 'List emails (newest first)', querystring: listEmailsQuery, response: { 200: listOf(emailSummaryView) } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const cursor = decodeCursor(req.query.cursor);
      const limit = req.query.limit;
      return req.tenant(async (tx) => {
        const rows = await tx
          .select()
          .from(emails)
          .where(
            and(
              eq(emails.orgId, p.orgId),
              eq(emails.projectId, p.projectId),
              req.query.created_after ? sql`${emails.createdAt} >= ${req.query.created_after}::timestamptz` : undefined,
              req.query.created_before ? sql`${emails.createdAt} < ${req.query.created_before}::timestamptz` : undefined,
              req.query.api_key_id ? eq(emails.apiKeyId, req.query.api_key_id) : undefined,
              req.query.source ? eq(emails.source, req.query.source) : undefined,
              req.query.test_mode !== undefined ? eq(emails.isTest, req.query.test_mode === 'true') : undefined,
              req.query.search ? sql`(strpos(lower(${emails.subject}), lower(${req.query.search})) > 0 or strpos(lower(${emails.fromAddress}), lower(${req.query.search})) > 0 or exists (select 1 from ${emailRecipients} where ${emailRecipients.emailId} = ${emails.id} and strpos(lower(${emailRecipients.address}), lower(${req.query.search})) > 0))` : undefined,
              cursor ? sql`(date_trunc('milliseconds', ${emails.createdAt}), ${emails.id}) < (${cursor.t.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined,
              req.query.status
                ? sql`exists (select 1 from ${emailRecipients} where ${emailRecipients.emailId} = ${emails.id} and ${emailRecipients.state} = ${req.query.status})`
                : undefined,
            ),
          )
          .orderBy(sql`date_trunc('milliseconds', ${emails.createdAt}) desc`, desc(emails.id))
          .limit(limit + 1);
        const views = await summaries(tx, rows.slice(0, limit));
        const result = page(rows, limit, (row) => row.id);
        return { data: views, next_cursor: result.next_cursor };
      });
    },
  );

  r.get(
    '/v1/emails/:id',
    { config: { permission: 'emails:read' }, schema: { tags, summary: 'Get an email with per-recipient status and events', params: uuidParam, response: { 200: emailDetailView } } },
    async (req) => {
      const p = principalOf(req.principal);
      const canReadContent = p.permissions.has('emails:read_content');
      return req.tenant(async (tx) => {
        const [email] = await tx.select().from(emails).where(and(eq(emails.id, req.params.id), eq(emails.orgId, p.orgId), eq(emails.projectId, p.projectId)));
        if (!email) throw new AppError('not_found', 'email not found');
        const [summary] = await summaries(tx, [email]);
        const [content] = await tx.select().from(emailContents).where(eq(emailContents.emailId, email.id));
        const recipients = await tx.select().from(emailRecipients).where(eq(emailRecipients.emailId, email.id)).orderBy(asc(emailRecipients.createdAt));
        const events = await tx
          .select()
          .from(emailEvents)
          .where(eq(emailEvents.emailId, email.id))
          .orderBy(asc(emailEvents.occurredAt), asc(emailEvents.createdAt));
        return {
          ...summary!,
          message_id: email.messageId,
          reply_to: (content?.replyTo ?? []).map((a) => a.address),
          metadata: email.metadata,
          recipients: recipients.map((x) => ({
            id: x.id,
            kind: x.kind,
            address: x.address,
            state: x.state,
            state_changed_at: x.stateChangedAt.toISOString(),
            last_smtp_code: x.lastSmtpCode,
            last_enhanced_status: x.lastEnhancedStatus,
            last_response: x.lastResponse,
            bounce_class: x.bounceClass,
          })),
          events: events.map((e) => ({ id: e.id, type: e.type, recipient_id: e.recipientId, data: e.data, occurred_at: e.occurredAt.toISOString() })),
          content: canReadContent && content ? { html: content.html, text: content.text } : null,
        };
      });
    },
  );

  r.patch('/v1/emails/:id', {
    config: { permission: 'emails:send' },
    schema: { tags, summary: 'Reschedule an unclaimed scheduled email', params: uuidParam, body: rescheduleEmailRequest,
      response: { 200: z.object({ id: z.string().uuid(), scheduled_at: z.string() }) } },
  }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant((tx) => rescheduleEmail(tx, p.orgId, p.projectId, req.params.id, new Date(req.body.scheduled_at)));
  });

  r.post(
    '/v1/emails/:id/cancel',
    {
      config: { permission: 'emails:send' },
      schema: {
        tags,
        summary: 'Cancel recipients not yet handed to the MTA',
        params: uuidParam,
        response: { 200: z.object({ id: z.string(), cancelled: z.number(), not_cancellable: z.number() }) },
      },
    },
    async (req) => {
      const p = principalOf(req.principal);
      return req.tenant(async (tx) => {
        const [email] = await tx.select({ id: emails.id }).from(emails).where(and(eq(emails.id, req.params.id), eq(emails.orgId, p.orgId), eq(emails.projectId, p.projectId)));
        if (!email) throw new AppError('not_found', 'email not found');
        const recipients = await tx.select({ id: emailRecipients.id, state: emailRecipients.state }).from(emailRecipients).where(eq(emailRecipients.emailId, email.id));
        let cancelled = 0;
        for (const rcpt of recipients) {
          if (!(DISPATCHABLE_STATES as readonly string[]).includes(rcpt.state)) continue;
          const res = await transitionRecipient(tx, { recipientId: rcpt.id, to: 'CANCELLED', cause: 'api-cancel', occurredAt: new Date() });
          if (res?.applied) cancelled += 1;
        }
        if (cancelled === 0) throw new AppError('invalid_state', 'no recipients can be cancelled; they have already been handed to the MTA or finished');
        return { id: email.id, cancelled, not_cancellable: recipients.length - cancelled };
      });
    },
  );
}
