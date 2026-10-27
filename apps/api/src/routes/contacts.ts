import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contactView, contactWrite, listOf, paginationQuery, uuidParam } from '@mp/contracts';
import { writeAudit } from '@mp/core';
import { and, contacts, desc, eq, sql } from '@mp/database';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';
import { decodeCursor, page } from '../views';
const view = (c: typeof contacts.$inferSelect) => ({ id: c.id, email: c.email, first_name: c.firstName, last_name: c.lastName, unsubscribed: c.unsubscribed, properties: c.properties, revision: c.revision, archived_at: c.archivedAt?.toISOString() ?? null, created_at: c.createdAt.toISOString(), updated_at: c.updatedAt.toISOString() });
const values = (c: z.infer<typeof contactWrite>) => ({ email: c.email, emailLower: c.email.toLowerCase(), firstName: c.first_name, lastName: c.last_name, unsubscribed: c.unsubscribed, properties: c.properties });
export function contactRoutes(app: FastifyInstance, _deps: AppDeps) {
    const r = app.withTypeProvider<ZodTypeProvider>(), tags = ['Contacts'];
    const read = { permission: 'contacts:read' as const }, manage = { permission: 'contacts:manage' as const };
    r.get('/v1/contacts', { config: read, schema: { tags, querystring: paginationQuery.extend({ search: z.string().max(200).optional(), unsubscribed: z.enum(['true', 'false']).optional(), archived: z.enum(['true', 'false']).default('false') }), response: { 200: listOf(contactView) } } }, async (req) => {
        const p = principalOf(req.principal), cursor = decodeCursor(req.query.cursor);
        return req.tenant(async (tx) => page(await tx.select().from(contacts).where(and(eq(contacts.orgId, p.orgId), eq(contacts.projectId, p.projectId), req.query.archived === 'true' ? undefined : sql `${contacts.archivedAt} is null`, req.query.unsubscribed === undefined ? undefined : eq(contacts.unsubscribed, req.query.unsubscribed === 'true'), req.query.search ? sql `strpos(lower(${contacts.email} || ' ' || ${contacts.firstName} || ' ' || ${contacts.lastName}),lower(${req.query.search}))>0` : undefined, cursor ? sql `(date_trunc('milliseconds',${contacts.createdAt}),${contacts.id}) < (${cursor.t.toISOString()}::timestamptz,${cursor.id}::uuid)` : undefined)).orderBy(sql `date_trunc('milliseconds',${contacts.createdAt}) desc`, desc(contacts.id)).limit(req.query.limit + 1), req.query.limit, view));
    });
    r.post('/v1/contacts', { config: manage, schema: { tags, body: contactWrite, response: { 201: contactView } } }, async (req, reply) => {
        const p = principalOf(req.principal);
        return reply.status(201).send(await req.tenant(async (tx) => {
            const [row] = await tx.insert(contacts).values({ orgId: p.orgId, projectId: p.projectId, ...values(req.body) }).onConflictDoNothing().returning();
            if (!row)
                throw new AppError('conflict', 'contact email already exists; restore archived contacts explicitly');
            await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'contact.created', targetType: 'contact', targetId: row.id });
            return view(row);
        }));
    });
    r.post('/v1/contacts/import', { config: manage, bodyLimit: 4 * 1024 * 1024, schema: { tags, body: z.object({ contacts: z.array(contactWrite).min(1).max(500) }).strict(), response: { 200: z.object({ created: z.number(), updated: z.number(), skipped_archived: z.number() }) } } }, async (req) => {
        const p = principalOf(req.principal);
        const addresses = req.body.contacts.map(c => c.email.toLowerCase());
        if (new Set(addresses).size !== addresses.length)
            throw new AppError('validation_error', 'duplicate emails in import');
        return req.tenant(async (tx) => {
            // Serialize import/create-update races by project; unique indexes remain the final guard.
            await tx.execute(sql `select pg_advisory_xact_lock(hashtextextended(${`contacts:${p.projectId}`},0))`);
            let created = 0, updated = 0, skipped_archived = 0;
            for (const input of [...req.body.contacts].sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()))) {
                const [existing] = await tx.select().from(contacts).where(and(eq(contacts.projectId, p.projectId), eq(contacts.orgId, p.orgId), eq(contacts.emailLower, input.email.toLowerCase()))).for('update');
                if (existing?.archivedAt) {
                    skipped_archived++;
                    continue;
                }
                if (existing) {
                    await tx.update(contacts).set({ ...values(input), unsubscribed: existing.unsubscribed || input.unsubscribed, revision: existing.revision + 1, updatedAt: new Date() }).where(eq(contacts.id, existing.id));
                    updated++;
                }
                else {
                    const inserted = await tx.insert(contacts).values({ orgId: p.orgId, projectId: p.projectId, ...values(input) }).onConflictDoNothing().returning({ id: contacts.id });
                    if (!inserted.length)
                        throw new AppError('conflict', 'a contact was created concurrently; retry import');
                    created++;
                }
            }
            await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'contacts.imported', metadata: { created, updated, skipped_archived } });
            return { created, updated, skipped_archived };
        });
    });
    r.get('/v1/contacts/:id', { config: read, schema: { tags, params: uuidParam, response: { 200: contactView } } }, async (req) => {
        const p = principalOf(req.principal);
        return req.tenant(async (tx) => { const [row] = await tx.select().from(contacts).where(and(eq(contacts.id, req.params.id), eq(contacts.orgId, p.orgId), eq(contacts.projectId, p.projectId))); if (!row)
            throw new AppError('not_found', 'contact not found'); return view(row); });
    });
    r.patch('/v1/contacts/:id', { config: manage, schema: { tags, params: uuidParam, body: z.object({ expected_revision: z.number().int().positive(), contact: contactWrite }).strict(), response: { 200: contactView } } }, async (req) => {
        const p = principalOf(req.principal);
        return req.tenant(async (tx) => {
            const [row] = await tx.select().from(contacts).where(and(eq(contacts.id, req.params.id), eq(contacts.orgId, p.orgId), eq(contacts.projectId, p.projectId))).for('update');
            if (!row)
                throw new AppError('not_found', 'contact not found');
            if (row.archivedAt)
                throw new AppError('invalid_state', 'restore before editing');
            if (row.revision !== req.body.expected_revision)
                throw new AppError('conflict', 'contact changed; reload before saving');
            const input = values(req.body.contact);
            // The email identity stays fixed; changes should create a fresh contact with new consent.
            if (input.emailLower !== row.emailLower)
                throw new AppError('validation_error', 'contact email cannot change');
            const [updated] = await tx.update(contacts).set({ ...input, revision: row.revision + 1, updatedAt: new Date() }).where(eq(contacts.id, row.id)).returning();
            await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'contact.updated', targetType: 'contact', targetId: row.id, metadata: { unsubscribed: input.unsubscribed } });
            return view(updated!);
        });
    });
    for (const [path, archived] of [['archive', true], ['restore', false]] as const)
        r.post(`/v1/contacts/:id/${path}`, { config: manage, schema: { tags, params: uuidParam, response: { 200: contactView } } }, async (req) => {
            const p = principalOf(req.principal);
            return req.tenant(async (tx) => { const [row] = await tx.update(contacts).set({ archivedAt: archived ? new Date() : null, revision: sql `${contacts.revision}+1`, updatedAt: new Date() }).where(and(eq(contacts.id, req.params.id), eq(contacts.orgId, p.orgId), eq(contacts.projectId, p.projectId))).returning(); if (!row)
                throw new AppError('not_found', 'contact not found'); await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: archived ? 'contact.archived' : 'contact.restored', targetType: 'contact', targetId: row.id }); return view(row); });
        });
}
