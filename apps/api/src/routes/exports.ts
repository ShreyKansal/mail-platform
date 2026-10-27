import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exportFilters, exportJobView, listOf, paginationQuery, uuidParam } from '@mp/contracts';
import { exportView, writeAudit } from '@mp/core';
import { and, desc, eq, exportChunks, exportJobs, notifications, sql } from '@mp/database';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';
import { decodeCursor, page } from '../views';

export function exportRoutes(app: FastifyInstance, _deps: AppDeps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const config = { permission: 'org:manage' as const, sessionOnly: true };
  r.post('/v1/exports', { config, schema: { tags: ['Exports'], summary: 'Queue a background email CSV export', body: z.object({ filters: exportFilters.default({}) }).strict(), response: { 202: exportJobView } } }, async (req, reply) => {
    const p = principalOf(req.principal);
    const job = await req.tenant(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`exports:${p.projectId}`}, 0))`);
      const active = await tx.select({ id: exportJobs.id }).from(exportJobs).where(and(eq(exportJobs.orgId, p.orgId), eq(exportJobs.projectId, p.projectId), sql`${exportJobs.status} in ('queued', 'running')`, sql`${exportJobs.expiresAt} > now()`));
      if (active.length >= 5) throw new AppError('rate_limited', 'at most five active exports are allowed per project');
      const [created] = await tx.insert(exportJobs).values({ orgId: p.orgId, projectId: p.projectId, filters: Object.fromEntries(Object.entries(req.body.filters).filter((entry) => entry[1] !== undefined)) as Record<string, string>, expiresAt: new Date(Date.now() + 7 * 86400_000) }).returning();
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'export.created', targetType: 'export', targetId: created!.id, requestId: req.id });
      return exportView(created!);
    });
    return reply.status(202).send(job);
  });
  r.get('/v1/exports', { config, schema: { tags: ['Exports'], summary: 'List background exports', querystring: paginationQuery, response: { 200: listOf(exportJobView) } } }, async (req) => {
    const p = principalOf(req.principal); const cursor = decodeCursor(req.query.cursor);
    return req.tenant(async (tx) => {
      const rows = await tx.select().from(exportJobs).where(and(eq(exportJobs.orgId, p.orgId), eq(exportJobs.projectId, p.projectId), cursor ? sql`(date_trunc('milliseconds', ${exportJobs.createdAt}), ${exportJobs.id}) < (${cursor.t.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined))
        .orderBy(sql`date_trunc('milliseconds', ${exportJobs.createdAt}) desc`, desc(exportJobs.id)).limit(req.query.limit + 1);
      return page(rows, req.query.limit, exportView);
    });
  });
  r.get('/v1/exports/:id', { config, schema: { tags: ['Exports'], summary: 'Inspect an export', params: uuidParam, response: { 200: exportJobView } } }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [job] = await tx.select().from(exportJobs).where(and(eq(exportJobs.id, req.params.id), eq(exportJobs.orgId, p.orgId), eq(exportJobs.projectId, p.projectId)));
      if (!job) throw new AppError('not_found', 'export not found');
      return exportView(job);
    });
  });
  r.get('/v1/exports/:id/download', { config, schema: { tags: ['Exports'], summary: 'Download a ready unexpired export', params: uuidParam } }, async (req, reply) => {
    const p = principalOf(req.principal);
    const job = await req.tenant(async (tx) => {
      const [row] = await tx.select().from(exportJobs).where(and(eq(exportJobs.id, req.params.id), eq(exportJobs.orgId, p.orgId), eq(exportJobs.projectId, p.projectId)));
      if (!row || row.expiresAt <= new Date()) throw new AppError('not_found', 'export not found or expired');
      if (row.status !== 'ready') throw new AppError('invalid_state', 'export is not ready');
      return row;
    });
    async function* contents() {
      for (let part = 0; part < job.chunkCount; part++) {
        const chunk = await req.tenant(async (tx) => {
          const [row] = await tx.select({ csv: exportChunks.csv }).from(exportChunks).where(and(eq(exportChunks.jobId, job.id), eq(exportChunks.orgId, p.orgId), eq(exportChunks.part, part)));
          return row;
        });
        if (!chunk) throw new Error('export expired during download');
        yield chunk.csv;
      }
    }
    return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="emails-${job.id}.csv"`).send(Readable.from(contents()));
  });
  r.get('/v1/notifications', { config: { permission: 'org:read', sessionOnly: true }, schema: { tags: ['Notifications'], summary: 'List durable project notifications', querystring: paginationQuery,
    response: { 200: listOf(z.object({ id: z.string().uuid(), type: z.string(), message: z.string(), resource_id: z.string().uuid().nullable(), created_at: z.string() })) } } }, async (req) => {
    const p = principalOf(req.principal); const cursor = decodeCursor(req.query.cursor);
    return req.tenant(async (tx) => {
      const rows = await tx.select().from(notifications).where(and(eq(notifications.orgId, p.orgId), eq(notifications.projectId, p.projectId), cursor ? sql`(date_trunc('milliseconds', ${notifications.createdAt}), ${notifications.id}) < (${cursor.t.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined))
        .orderBy(sql`date_trunc('milliseconds', ${notifications.createdAt}) desc`, desc(notifications.id)).limit(req.query.limit + 1);
      return page(rows, req.query.limit, (row) => ({ id: row.id, type: row.type, message: row.message, resource_id: row.resourceId, created_at: row.createdAt.toISOString() }));
    });
  });
}
