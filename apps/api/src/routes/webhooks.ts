import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  createWebhookRequest,
  createWebhookResponse,
  listOf,
  paginationQuery,
  updateWebhookRequest,
  uuidParam,
  webhookDeliveryView as deliverySchema,
  webhookView as webhookSchema,
} from '@mp/contracts';
import { generateWebhookSecret, resolveSafeTarget, validateUrlShape, writeAudit, type UrlPolicy } from '@mp/core';
import { and, desc, eq, sql, webhookAttempts, webhookDeliveries, webhookEndpoints } from '@mp/database';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';
import { decodeCursor, page, webhookDeliveryView, webhookView } from '../views';

const MAX_ENDPOINTS_PER_PROJECT = 20;
const ROTATION_OVERLAP_HOURS = 24;

export function webhookRoutes(app: FastifyInstance, deps: AppDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Webhooks'];
  const policy: UrlPolicy = {
    allowHttp: deps.config.WEBHOOK_ALLOW_HTTP,
    allowPrivateNetworks: deps.config.WEBHOOK_ALLOW_PRIVATE_NETWORKS,
  };
  const checkUrl = async (raw: string) => {
    const url = validateUrlShape(raw, policy);
    await resolveSafeTarget(url, policy);
    return url.toString();
  };
  const secretAad = (id: string) => `webhook:${id}`;
  const deliveryParams = z.object({ id: z.string().uuid(), deliveryId: z.string().uuid() });
  r.post('/v1/webhooks/:id/test', { config: { permission: 'webhooks:manage' }, schema: { tags, summary: 'Queue a signed synthetic webhook test', params: uuidParam, response: { 202: deliverySchema } } }, async (req, reply) => {
    const p = principalOf(req.principal);
    const delivery = await req.tenant(async (tx) => {
      const [endpoint] = await tx.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.orgId, p.orgId), eq(webhookEndpoints.projectId, p.projectId))).for('update');
      if (!endpoint) throw new AppError('not_found', 'webhook not found');
      if (!endpoint.enabled) throw new AppError('invalid_state', 'enable the endpoint before sending a test');
      const recent = await tx.select({ id: webhookDeliveries.id }).from(webhookDeliveries).where(and(eq(webhookDeliveries.endpointId, endpoint.id), eq(webhookDeliveries.eventType, 'webhook.test'), sql`${webhookDeliveries.createdAt} > now() - interval '10 seconds'`)).limit(1);
      if (recent.length) throw new AppError('rate_limited', 'wait 10 seconds before sending another test event');
      const eventId = randomUUID();
      const [created] = await tx.insert(webhookDeliveries).values({ orgId: p.orgId, endpointId: endpoint.id, eventId, eventType: 'webhook.test',
        payload: { id: eventId, type: 'webhook.test', created_at: new Date().toISOString(), data: { test: true, endpoint_id: endpoint.id } } }).returning();
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'webhook.test_queued', targetType: 'webhook', targetId: endpoint.id, requestId: req.id });
      return webhookDeliveryView(created!);
    });
    return reply.status(202).send(delivery);
  });

  r.post('/v1/webhooks/:id/deliveries/:deliveryId/replay', {
    config: { permission: 'webhooks:manage' },
    schema: { tags, summary: 'Replay a completed webhook delivery', params: deliveryParams, response: { 200: deliverySchema } },
  }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [endpoint] = await tx.select().from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.orgId, p.orgId), eq(webhookEndpoints.projectId, p.projectId))).for('update');
      if (!endpoint) throw new AppError('not_found', 'webhook not found');
      if (!endpoint.enabled) throw new AppError('invalid_state', 'enable the webhook before replaying');
      const [delivery] = await tx.select().from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.id, req.params.deliveryId), eq(webhookDeliveries.endpointId, endpoint.id), eq(webhookDeliveries.orgId, p.orgId))).for('update');
      if (!delivery) throw new AppError('not_found', 'delivery not found');
      if (!['succeeded', 'dead'].includes(delivery.status)) throw new AppError('invalid_state', 'delivery is already pending or in progress');
      const [updated] = await tx.update(webhookDeliveries).set({ status: 'pending', retryCycleAttempts: 0, nextAttemptAt: new Date(), completedAt: null, leaseExpiresAt: null, lastError: null, lastStatusCode: null })
        .where(eq(webhookDeliveries.id, delivery.id)).returning();
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'webhook.replayed', targetType: 'webhook_delivery', targetId: delivery.id, requestId: req.id, ip: req.ip });
      return webhookDeliveryView(updated!);
    });
  });

  r.get('/v1/webhooks/:id/deliveries/:deliveryId/attempts', {
    config: { permission: 'webhooks:read' },
    schema: { tags, summary: 'Inspect attempts for a webhook delivery', params: deliveryParams, querystring: paginationQuery,
      response: { 200: listOf(z.object({ id: z.string().uuid(), attempt: z.number(), status_code: z.number().nullable(), error: z.string().nullable(), duration_ms: z.number(), created_at: z.string() })) } },
  }, async (req) => {
    const p = principalOf(req.principal);
    const cursor = decodeCursor(req.query.cursor);
    return req.tenant(async (tx) => {
      const [delivery] = await tx.select({ id: webhookDeliveries.id }).from(webhookDeliveries)
        .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
        .where(and(eq(webhookDeliveries.id, req.params.deliveryId), eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.projectId, p.projectId), eq(webhookEndpoints.orgId, p.orgId)));
      if (!delivery) throw new AppError('not_found', 'delivery not found');
      const rows = await tx.select().from(webhookAttempts).where(and(eq(webhookAttempts.deliveryId, delivery.id),
        cursor ? sql`(date_trunc('milliseconds', ${webhookAttempts.createdAt}), ${webhookAttempts.id}) < (${cursor.t.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined))
        .orderBy(sql`date_trunc('milliseconds', ${webhookAttempts.createdAt}) desc`, desc(webhookAttempts.id)).limit(req.query.limit + 1);
      return page(rows, req.query.limit, (a) => ({ id: a.id, attempt: a.attemptNo, status_code: a.statusCode, error: a.error, duration_ms: a.durationMs, created_at: a.createdAt.toISOString() }));
    });
  });

  r.post(
    '/v1/webhooks',
    {
      config: { permission: 'webhooks:manage' },
      schema: { tags, summary: 'Create a webhook endpoint (secret shown once)', body: createWebhookRequest, response: { 201: createWebhookResponse } },
    },
    async (req, reply) => {
      const p = principalOf(req.principal);
      const url = await checkUrl(req.body.url);
      const secret = generateWebhookSecret();
      const row = await req.tenant(async (tx) => {
        const [{ n } = { n: 0 }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(webhookEndpoints)
          .where(and(eq(webhookEndpoints.orgId, p.orgId), eq(webhookEndpoints.projectId, p.projectId)));
        if (n >= MAX_ENDPOINTS_PER_PROJECT) throw new AppError('conflict', `at most ${MAX_ENDPOINTS_PER_PROJECT} webhook endpoints per project`);
        const id = crypto.randomUUID();
        const [created] = await tx
          .insert(webhookEndpoints)
          .values({
            id,
            orgId: p.orgId,
            projectId: p.projectId,
            url,
            description: req.body.description ?? null,
            eventTypes: [...new Set(req.body.event_types)],
            secretSealed: deps.core.secrets.seal(secret, secretAad(id)),
          })
          .returning();
        await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'webhook.created', targetType: 'webhook', targetId: id, ip: req.ip, requestId: req.id, metadata: { url } });
        return created!;
      });
      return reply.status(201).send({ ...webhookView(row), secret });
    },
  );

  r.get(
    '/v1/webhooks',
    { config: { permission: 'webhooks:read' }, schema: { tags, summary: 'List webhook endpoints', response: { 200: z.object({ data: z.array(webhookSchema) }) } } },
    async (req) => {
      const p = principalOf(req.principal);
      const rows = await req.tenant((tx) =>
        tx
          .select()
          .from(webhookEndpoints)
          .where(and(eq(webhookEndpoints.orgId, p.orgId), eq(webhookEndpoints.projectId, p.projectId)))
          .orderBy(desc(webhookEndpoints.createdAt)),
      );
      return { data: rows.map(webhookView) };
    },
  );

  r.patch(
    '/v1/webhooks/:id',
    {
      config: { permission: 'webhooks:manage' },
      schema: { tags, summary: 'Update a webhook endpoint', params: uuidParam, body: updateWebhookRequest, response: { 200: webhookSchema } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const url = req.body.url ? await checkUrl(req.body.url) : undefined;
      return req.tenant(async (tx) => {
        const [row] = await tx
          .update(webhookEndpoints)
          .set({
            ...(url ? { url } : {}),
            ...(req.body.event_types ? { eventTypes: [...new Set(req.body.event_types)] } : {}),
            ...(req.body.description !== undefined ? { description: req.body.description } : {}),
            ...(req.body.enabled !== undefined ? { enabled: req.body.enabled, disabledReason: req.body.enabled ? null : 'disabled by user' } : {}),
            ...(req.body.enabled !== undefined ? { healthGeneration: sql`${webhookEndpoints.healthGeneration} + 1`, consecutiveFailures: 0, firstFailureAt: null } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.orgId, p.orgId)))
          .returning();
        if (!row) throw new AppError('not_found', 'webhook not found');
        await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'webhook.updated', targetType: 'webhook', targetId: row.id, ip: req.ip, requestId: req.id });
        return webhookView(row);
      });
    },
  );

  r.post(
    '/v1/webhooks/:id/rotate-secret',
    {
      config: { permission: 'webhooks:manage' },
      schema: {
        tags,
        summary: 'Rotate the signing secret (new secret shown once)',
        description: `For ${ROTATION_OVERLAP_HOURS} hours after rotation, deliveries carry signatures from both the new and the previous secret so receivers can switch without dropping events.`,
        params: uuidParam,
        response: { 200: createWebhookResponse },
      },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const secret = generateWebhookSecret();
      return req.tenant(async (tx) => {
        const [row] = await tx
          .update(webhookEndpoints)
          .set({
            previousSecretSealed: sql`${webhookEndpoints.secretSealed}`,
            previousSecretExpiresAt: new Date(Date.now() + ROTATION_OVERLAP_HOURS * 3600_000),
            secretSealed: deps.core.secrets.seal(secret, secretAad(req.params.id)),
            updatedAt: new Date(),
          })
          .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.orgId, p.orgId)))
          .returning();
        if (!row) throw new AppError('not_found', 'webhook not found');
        await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'webhook.secret_rotated', targetType: 'webhook', targetId: row.id, ip: req.ip, requestId: req.id });
        return { ...webhookView(row), secret };
      });
    },
  );

  r.delete(
    '/v1/webhooks/:id',
    { config: { permission: 'webhooks:manage' }, schema: { tags, summary: 'Delete a webhook endpoint', params: uuidParam, response: { 200: z.object({ id: z.string(), deleted: z.literal(true) }) } } },
    async (req) => {
      const p = principalOf(req.principal);
      return req.tenant(async (tx) => {
        const [row] = await tx
          .delete(webhookEndpoints)
          .where(and(eq(webhookEndpoints.id, req.params.id), eq(webhookEndpoints.orgId, p.orgId)))
          .returning({ id: webhookEndpoints.id });
        if (!row) throw new AppError('not_found', 'webhook not found');
        await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'webhook.deleted', targetType: 'webhook', targetId: row.id, ip: req.ip, requestId: req.id });
        return { id: row.id, deleted: true as const };
      });
    },
  );

  r.get(
    '/v1/webhooks/:id/deliveries',
    {
      config: { permission: 'webhooks:read' },
      schema: { tags, summary: 'Delivery attempts for an endpoint', params: uuidParam, querystring: paginationQuery, response: { 200: listOf(deliverySchema) } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const cursor = decodeCursor(req.query.cursor);
      return req.tenant(async (tx) => {
        const rows = await tx
          .select()
          .from(webhookDeliveries)
          .where(
            and(
              eq(webhookDeliveries.orgId, p.orgId),
              eq(webhookDeliveries.endpointId, req.params.id),
              cursor
                ? sql`(date_trunc('milliseconds', ${webhookDeliveries.createdAt}), ${webhookDeliveries.id}) < (${cursor.t.toISOString()}::timestamptz, ${cursor.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(sql`date_trunc('milliseconds', ${webhookDeliveries.createdAt}) desc`, desc(webhookDeliveries.id))
          .limit(req.query.limit + 1);
        return page(rows, req.query.limit, webhookDeliveryView);
      });
    },
  );
}
