import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createSuppressionRequest,
  emailEventView,
  listOf,
  overviewView,
  overviewQuery,
  paginationQuery,
  suppressionView as suppressionSchema,
  uuidParam,
} from '@mp/contracts';
import { suppress, writeAudit } from '@mp/core';
import { and, apiRequestLogs, desc, domains, emailEvents, emailRecipients, emails, eq, inArray, organizations, sql, suppressions } from '@mp/database';
import { AddressError, parseAddress } from '@mp/mail-protocol';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';
import { decodeCursor, page, suppressionView } from '../views';

const keyset = (col: unknown, idCol: unknown, cursor: { t: Date; id: string } | null) =>
  cursor ? sql`(date_trunc('milliseconds', ${col}), ${idCol}) < (${cursor.t.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined;

export function insightRoutes(app: FastifyInstance, _deps: AppDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const logView = z.object({ id: z.string().uuid(), request_id: z.string(), method: z.string(), route: z.string(), status_code: z.number(), duration_ms: z.number(), api_key_id: z.string().uuid().nullable(), created_at: z.string() });
  const viewLog = (row: typeof apiRequestLogs.$inferSelect) => ({ id: row.id, request_id: row.requestId, method: row.method, route: row.route, status_code: row.statusCode, duration_ms: row.durationMs, api_key_id: row.apiKeyId, created_at: row.createdAt.toISOString() });
  r.get('/v1/logs', {
    config: { permission: 'emails:read' }, schema: { tags: ['Logs'], summary: 'List redacted API request logs',
      querystring: paginationQuery.extend({ status_code: z.coerce.number().int().min(100).max(599).optional(), api_key_id: z.string().uuid().optional() }), response: { 200: listOf(logView) } },
  }, async (req) => {
    const p = principalOf(req.principal);
    const cursor = decodeCursor(req.query.cursor);
    return req.tenant(async (tx) => {
      const rows = await tx.select().from(apiRequestLogs).where(and(eq(apiRequestLogs.orgId, p.orgId), eq(apiRequestLogs.projectId, p.projectId),
        req.query.status_code ? eq(apiRequestLogs.statusCode, req.query.status_code) : undefined,
        req.query.api_key_id ? eq(apiRequestLogs.apiKeyId, req.query.api_key_id) : undefined,
        keyset(apiRequestLogs.createdAt, apiRequestLogs.id, cursor)))
        .orderBy(sql`date_trunc('milliseconds', ${apiRequestLogs.createdAt}) desc`, desc(apiRequestLogs.id)).limit(req.query.limit + 1);
      return page(rows, req.query.limit, viewLog);
    });
  });
  r.get('/v1/logs/:id', { config: { permission: 'emails:read' }, schema: { tags: ['Logs'], summary: 'Retrieve an API request log', params: uuidParam, response: { 200: logView } } }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [row] = await tx.select().from(apiRequestLogs).where(and(eq(apiRequestLogs.id, req.params.id), eq(apiRequestLogs.orgId, p.orgId), eq(apiRequestLogs.projectId, p.projectId)));
      if (!row) throw new AppError('not_found', 'log not found');
      return viewLog(row);
    });
  });
  r.get('/v1/analytics', { config: { permission: 'analytics:read' }, schema: { tags: ['Analytics'], summary: 'Daily event counts for up to 90 days',
    querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(30), test_mode: z.enum(['true', 'false']).default('false') }),
    response: { 200: z.object({ timezone: z.literal('UTC'), days: z.number(), data: z.array(z.object({ date: z.string(), type: z.string(), count: z.number() })) }) } } }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const result = await tx.execute<{ date: string; type: string; count: number }>(sql`
        select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD') as date, type, count(*)::int as count
        from email_events where org_id = ${p.orgId} and project_id = ${p.projectId}
          and exists (select 1 from emails e where e.id = email_events.email_id and e.is_test = ${req.query.test_mode === 'true'})
          and occurred_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - make_interval(days => ${req.query.days - 1})
        group by 1, 2 order by 1, 2`);
      return { timezone: 'UTC' as const, days: req.query.days, data: result.rows };
    });
  });
  r.get('/v1/usage', { config: { permission: 'analytics:read' }, schema: { tags: ['Analytics'], summary: 'Daily accepted email and recipient usage',
    querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(30), test_mode: z.enum(['true', 'false']).default('false') }),
    response: { 200: z.object({ timezone: z.literal('UTC'), days: z.number(), data: z.array(z.object({ date: z.string(), emails: z.number(), recipients: z.number() })) }) } } }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const result = await tx.execute<{ date: string; emails: number; recipients: number }>(sql`
        select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as date, count(*)::int as emails, sum(recipient_count)::int as recipients
        from emails where org_id = ${p.orgId} and project_id = ${p.projectId}
          and is_test = ${req.query.test_mode === 'true'}
          and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - make_interval(days => ${req.query.days - 1})
        group by 1 order by 1`);
      return { timezone: 'UTC' as const, days: req.query.days, data: result.rows };
    });
  });

  // ------------------------------------------------------------ Suppressions
  const parseSuppressionAddress = (value: string) => {
    try { return parseAddress(value).toLowerCase(); } catch { throw new AppError('validation_error', 'invalid email address'); }
  };
  r.post('/v1/suppressions/batch', { config: { permission: 'suppressions:manage' }, schema: { tags: ['Suppressions'], summary: 'Suppress up to 100 addresses atomically',
    body: z.object({ emails: z.array(z.string().min(3).max(320)).min(1).max(100) }).strict(), response: { 201: z.object({ added: z.number() }) } } }, async (req, reply) => {
    const p = principalOf(req.principal);
    const addresses = [...new Set(req.body.emails.map(parseSuppressionAddress))];
    await req.tenant(async (tx) => {
      for (const address of addresses) await suppress(tx, { orgId: p.orgId, address, reason: 'manual', detail: 'added manually in a batch' });
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'suppression.batch_added', requestId: req.id, metadata: { count: addresses.length } });
    });
    return reply.status(201).send({ added: addresses.length });
  });
  r.post('/v1/suppressions/batch/remove', { config: { permission: 'suppressions:manage' }, schema: { tags: ['Suppressions'], summary: 'Remove up to 100 suppressed addresses',
    body: z.object({ emails: z.array(z.string().min(3).max(320)).min(1).max(100) }).strict(), response: { 200: z.object({ removed: z.number() }) } } }, async (req) => {
    const p = principalOf(req.principal);
    const addresses = [...new Set(req.body.emails.map(parseSuppressionAddress))];
    return req.tenant(async (tx) => {
      const rows = await tx.delete(suppressions).where(and(eq(suppressions.orgId, p.orgId), inArray(suppressions.addressLower, addresses))).returning({ id: suppressions.id });
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'suppression.batch_removed', requestId: req.id, metadata: { count: rows.length } });
      return { removed: rows.length };
    });
  });
  r.get('/v1/suppressions/:id', { config: { permission: 'suppressions:read' }, schema: { tags: ['Suppressions'], summary: 'Retrieve a suppression by ID or email',
    params: z.object({ id: z.string().min(3).max(320) }), response: { 200: suppressionSchema } } }, async (req) => {
    const p = principalOf(req.principal);
    const isId = z.string().uuid().safeParse(req.params.id).success;
    const address = isId ? null : parseSuppressionAddress(req.params.id);
    return req.tenant(async (tx) => {
      const [row] = await tx.select().from(suppressions).where(and(eq(suppressions.orgId, p.orgId), isId ? eq(suppressions.id, req.params.id) : eq(suppressions.addressLower, address!)));
      if (!row) throw new AppError('not_found', 'suppression not found');
      return suppressionView(row);
    });
  });
  r.get(
    '/v1/suppressions',
    {
      config: { permission: 'suppressions:read' },
      schema: {
        tags: ['Suppressions'],
        summary: 'List suppressed addresses',
        querystring: paginationQuery.extend({ email: z.string().max(320).optional(), reason: suppressionSchema.shape.reason.optional() }),
        response: { 200: listOf(suppressionSchema) },
      },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const cursor = decodeCursor(req.query.cursor);
      return req.tenant(async (tx) => {
        const rows = await tx
          .select()
          .from(suppressions)
          .where(
            and(
              eq(suppressions.orgId, p.orgId),
              req.query.email ? eq(suppressions.addressLower, req.query.email.toLowerCase()) : undefined,
              req.query.reason ? eq(suppressions.reason, req.query.reason) : undefined,
              keyset(suppressions.createdAt, suppressions.id, cursor),
            ),
          )
          .orderBy(sql`date_trunc('milliseconds', ${suppressions.createdAt}) desc`, desc(suppressions.id))
          .limit(req.query.limit + 1);
        return page(rows, req.query.limit, suppressionView);
      });
    },
  );

  r.post(
    '/v1/suppressions',
    {
      config: { permission: 'suppressions:manage' },
      schema: { tags: ['Suppressions'], summary: 'Suppress an address', body: createSuppressionRequest, response: { 201: suppressionSchema } },
    },
    async (req, reply) => {
      const p = principalOf(req.principal);
      let address: string;
      try {
        address = parseAddress(req.body.email);
      } catch (err) {
        if (err instanceof AddressError) throw new AppError('validation_error', err.message, [{ path: 'email', message: err.message }]);
        throw err;
      }
      const row = await req.tenant(async (tx) => {
        await suppress(tx, { orgId: p.orgId, address, reason: 'manual', detail: 'added manually' });
        await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'suppression.created', ip: req.ip, requestId: req.id, metadata: { reason: 'manual' } });
        const [s] = await tx.select().from(suppressions).where(and(eq(suppressions.orgId, p.orgId), eq(suppressions.addressLower, address.toLowerCase())));
        return s!;
      });
      return reply.status(201).send(suppressionView(row));
    },
  );

  r.delete(
    '/v1/suppressions/:id',
    {
      config: { permission: 'suppressions:manage' },
      schema: { tags: ['Suppressions'], summary: 'Remove a suppression', params: uuidParam, response: { 200: z.object({ id: z.string(), deleted: z.literal(true) }) } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      return req.tenant(async (tx) => {
        const [row] = await tx
          .delete(suppressions)
          .where(and(eq(suppressions.id, req.params.id), eq(suppressions.orgId, p.orgId)))
          .returning({ id: suppressions.id, reason: suppressions.reason });
        if (!row) throw new AppError('not_found', 'suppression not found');
        await writeAudit(tx, {
          orgId: p.orgId,
          actor: actorOf(p),
          action: 'suppression.deleted',
          targetType: 'suppression',
          targetId: row.id,
          ip: req.ip,
          requestId: req.id,
          metadata: { reason: row.reason },
        });
        return { id: row.id, deleted: true as const };
      });
    },
  );

  // ------------------------------------------------------------------ Events
  r.get(
    '/v1/events',
    {
      config: { permission: 'emails:read' },
      schema: {
        tags: ['Events'],
        summary: 'Recent delivery events across the project',
        querystring: paginationQuery.extend({ type: z.string().max(64).optional() }),
        response: { 200: listOf(emailEventView.extend({ email_id: z.string().uuid() })) },
      },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const cursor = decodeCursor(req.query.cursor);
      return req.tenant(async (tx) => {
        const rows = await tx
          .select()
          .from(emailEvents)
          .where(
            and(
              eq(emailEvents.orgId, p.orgId),
              eq(emailEvents.projectId, p.projectId),
              req.query.type ? eq(emailEvents.type, req.query.type) : undefined,
              keyset(emailEvents.createdAt, emailEvents.id, cursor),
            ),
          )
          .orderBy(sql`date_trunc('milliseconds', ${emailEvents.createdAt}) desc`, desc(emailEvents.id))
          .limit(req.query.limit + 1);
        return page(rows, req.query.limit, (e) => ({
          id: e.id,
          email_id: e.emailId,
          type: e.type,
          recipient_id: e.recipientId,
          data: e.data,
          occurred_at: e.occurredAt.toISOString(),
        }));
      });
    },
  );

  // ---------------------------------------------------------------- Overview
  r.get(
    '/v1/overview',
    {
      config: { permission: 'analytics:read' },
      schema: {
        tags: ['Analytics'],
        summary: 'Recipient states for a selected period, current domain counts and daily quota usage',
        querystring: overviewQuery,
        response: { 200: overviewView },
      },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const hours = req.query.hours;
      return req.tenant(async (tx) => {
        const states = await tx
          .select({ state: emailRecipients.state, n: sql<number>`count(*)::int` })
          .from(emailRecipients)
          .innerJoin(emails, eq(emails.id, emailRecipients.emailId))
          .where(and(eq(emailRecipients.orgId, p.orgId), eq(emails.projectId, p.projectId), sql`${emailRecipients.createdAt} > now() - (${hours} * interval '1 hour')`))
          .groupBy(emailRecipients.state);
        const [dom] = await tx
          .select({
            total: sql<number>`count(*) filter (where ${domains.status} <> 'disabled')::int`,
            verified: sql<number>`count(*) filter (where ${domains.status} = 'verified')::int`,
          })
          .from(domains)
          .where(and(eq(domains.orgId, p.orgId), eq(domains.projectId, p.projectId)));
        const [sup] = await tx.select({ n: sql<number>`count(*)::int` }).from(suppressions).where(eq(suppressions.orgId, p.orgId));
        const [used] = await tx
          .select({ n: sql<number>`coalesce(sum(${emails.recipientCount}), 0)::int` })
          .from(emails)
          .where(and(eq(emails.orgId, p.orgId), sql`${emails.createdAt} > now() - interval '24 hours'`));
        const [org] = await tx.select({ limit: organizations.dailyRecipientLimit, unlimited: organizations.localUnlimitedSending }).from(organizations).where(eq(organizations.id, p.orgId));
        return {
          window_hours: hours,
          submitted_in_window: states.reduce((total, state) => total + state.n, 0),
          recipients_by_state: Object.fromEntries(states.map((s) => [s.state, s.n])),
          verified_domains: dom?.verified ?? 0,
          total_domains: dom?.total ?? 0,
          suppressions: sup?.n ?? 0,
          daily_limit: org?.limit ?? 0,
          local_unlimited_sending: !!_deps.core.localUnlimitedSending && org?.unlimited !== false,
          used_last_24h: used?.n ?? 0,
        };
      });
    },
  );
}
