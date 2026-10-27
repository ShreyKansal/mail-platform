import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { listOf, paginationQuery, templateUpdate, templateView, templateWrite, uuidParam } from '@mp/contracts';
import { renderTemplate, validateTemplate, writeAudit } from '@mp/core';
import { and, desc, eq, sql, templates, templateVersions, type Tx } from '@mp/database';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';
import { decodeCursor, page } from '../views';
const view = (t: typeof templates.$inferSelect) => ({ id: t.id, name: t.name, content: t.draft, revision: t.revision, published_version: t.publishedVersion, archived_at: t.archivedAt?.toISOString() ?? null, created_at: t.createdAt.toISOString(), updated_at: t.updatedAt.toISOString() });
export function templateRoutes(app: FastifyInstance, _deps: AppDeps) {
    const r = app.withTypeProvider<ZodTypeProvider>();
    const tags = ['Templates'];
    const read = { permission: 'templates:read' as const }, manage = { permission: 'templates:manage' as const };
    r.post('/v1/templates', { config: manage, schema: { tags, body: templateWrite, response: { 201: templateView } } }, async (req, reply) => {
        const p = principalOf(req.principal);
        validateTemplate(req.body.content);
        return reply.status(201).send(await req.tenant(async (tx) => {
            const [row] = await tx.insert(templates).values({ orgId: p.orgId, projectId: p.projectId, name: req.body.name, draft: req.body.content }).returning();
            await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'template.created', targetType: 'template', targetId: row!.id });
            return view(row!);
        }));
    });
    r.get('/v1/templates', { config: read, schema: { tags, querystring: paginationQuery.extend({ archived: z.enum(['true', 'false']).default('false') }), response: { 200: listOf(templateView) } } }, async (req) => {
        const p = principalOf(req.principal), cursor = decodeCursor(req.query.cursor);
        return req.tenant(async (tx) => page(await tx.select().from(templates).where(and(eq(templates.orgId, p.orgId), eq(templates.projectId, p.projectId), req.query.archived === 'true' ? undefined : sql `${templates.archivedAt} is null`, cursor ? sql `(date_trunc('milliseconds', ${templates.createdAt}), ${templates.id}) < (${cursor.t.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined)).orderBy(sql `date_trunc('milliseconds', ${templates.createdAt}) desc`, desc(templates.id)).limit(req.query.limit + 1), req.query.limit, view));
    });
    async function find(tx: Tx, orgId: string, projectId: string, id: string, lock = false) {
        const q = tx.select().from(templates).where(and(eq(templates.id, id), eq(templates.orgId, orgId), eq(templates.projectId, projectId)));
        const [row] = await (lock ? q.for('update') : q);
        if (!row)
            throw new AppError('not_found', 'template not found');
        return row;
    }
    r.get('/v1/templates/:id', { config: read, schema: { tags, params: uuidParam, response: { 200: templateView } } }, async (req) => {
        const p = principalOf(req.principal);
        return req.tenant(async (tx) => view(await find(tx, p.orgId, p.projectId, req.params.id)));
    });
    r.patch('/v1/templates/:id', { config: manage, schema: { tags, params: uuidParam, body: templateUpdate, response: { 200: templateView } } }, async (req) => {
        const p = principalOf(req.principal);
        validateTemplate(req.body.content);
        return req.tenant(async (tx) => {
            const row = await find(tx, p.orgId, p.projectId, req.params.id, true);
            if (row.archivedAt)
                throw new AppError('invalid_state', 'restore template before editing');
            if (row.revision !== req.body.expected_revision)
                throw new AppError('conflict', 'template changed; reload before saving');
            const [updated] = await tx.update(templates).set({ name: req.body.name, draft: req.body.content, revision: row.revision + 1, updatedAt: new Date() }).where(eq(templates.id, row.id)).returning();
            await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'template.updated', targetType: 'template', targetId: row.id });
            return view(updated!);
        });
    });
    r.post('/v1/templates/:id/publish', { config: manage, schema: { tags, params: uuidParam, body: z.object({ expected_revision: z.number().int().positive() }).strict(), response: { 200: templateView } } }, async (req) => {
        const p = principalOf(req.principal);
        return req.tenant(async (tx) => {
            const row = await find(tx, p.orgId, p.projectId, req.params.id, true);
            if (row.archivedAt)
                throw new AppError('invalid_state', 'restore template before publishing');
            if (row.revision !== req.body.expected_revision)
                throw new AppError('conflict', 'template changed; reload before publishing');
            validateTemplate(row.draft);
            const [previous] = await tx.select().from(templateVersions).where(and(eq(templateVersions.templateId, row.id), eq(templateVersions.version, row.revision)));
            if (!previous)
                await tx.insert(templateVersions).values({ orgId: p.orgId, templateId: row.id, version: row.revision, content: row.draft });
            const [updated] = await tx.update(templates).set({ publishedVersion: row.revision, updatedAt: new Date() }).where(eq(templates.id, row.id)).returning();
            if (!previous)
                await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'template.published', targetType: 'template', targetId: row.id, metadata: { version: row.revision } });
            return view(updated!);
        });
    });
    r.get('/v1/templates/:id/versions', { config: read, schema: { tags, params: uuidParam, querystring: z.object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }),
            response: { 200: z.object({ data: z.array(z.object({ version: z.number(), content: templateWrite.shape.content, created_at: z.string() })), next_before: z.number().nullable() }) } } }, async (req) => {
        const p = principalOf(req.principal);
        return req.tenant(async (tx) => {
            await find(tx, p.orgId, p.projectId, req.params.id);
            const rows = await tx.select().from(templateVersions).where(and(eq(templateVersions.templateId, req.params.id), eq(templateVersions.orgId, p.orgId), req.query.before ? sql `${templateVersions.version} < ${req.query.before}` : undefined)).orderBy(desc(templateVersions.version)).limit(req.query.limit + 1);
            return { data: rows.slice(0, req.query.limit).map(v => ({ version: v.version, content: v.content, created_at: v.createdAt.toISOString() })), next_before: rows.length > req.query.limit ? rows[req.query.limit - 1]!.version : null };
        });
    });
    r.post('/v1/templates/:id/preview', { config: read, schema: { tags, params: uuidParam, body: z.object({ variables: z.record(z.string(), z.union([z.string().max(10000), z.number().finite()])).default({}), version: z.number().int().positive().optional() }).strict(), response: { 200: z.object({ subject: z.string(), html: z.string().optional(), text: z.string().optional() }) } } }, async (req) => {
        const p = principalOf(req.principal);
        return req.tenant(async (tx) => {
            const row = await find(tx, p.orgId, p.projectId, req.params.id);
            let content = row.draft;
            if (req.body.version) {
                const [v] = await tx.select().from(templateVersions).where(and(eq(templateVersions.templateId, row.id), eq(templateVersions.version, req.body.version)));
                if (!v)
                    throw new AppError('not_found', 'version not found');
                content = v.content;
            }
            return renderTemplate(content, req.body.variables);
        });
    });
    for (const [path, archived] of [['archive', true], ['restore', false]] as const)
        r.post(`/v1/templates/:id/${path}`, { config: manage, schema: { tags, params: uuidParam, response: { 200: templateView } } }, async (req) => {
            const p = principalOf(req.principal);
            return req.tenant(async (tx) => { const row = await find(tx, p.orgId, p.projectId, req.params.id, true); const [updated] = await tx.update(templates).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(templates.id, row.id)).returning(); await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: archived ? 'template.archived' : 'template.restored', targetType: 'template', targetId: row.id }); return view(updated!); });
        });
}
