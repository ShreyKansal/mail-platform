import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '@mp/shared';
import { writeAudit } from '@mp/core';
import { sql, eq, and, isNull, contacts, broadcasts, automations, domains, emails, organizationMembers, organizations, users } from '@mp/database';
import { principalOf, actorOf, type AppDeps } from '../context';
export function settingsRoutes(app: FastifyInstance, deps: AppDeps) {
    const r = app.withTypeProvider<ZodTypeProvider>();
    const limits = z.object({ daily_recipient_limit: z.number().int().min(1).max(2147483647), per_minute_recipient_limit: z.number().int().min(1).max(2147483647), unlimited: z.boolean() }).strict();
    const view = limits.extend({ editable: z.boolean(), unlimited_available: z.boolean() });
    const unlimitedAvailable = !!deps.core.localUnlimitedSending;
    r.get('/v1/settings/usage', {
        config: { permission: 'analytics:read', sessionOnly: true },
        schema: { tags: ['Settings'], summary: 'Project resource usage and organization-wide rolling recipient usage', response: { 200: z.object({
            timezone: z.literal('UTC'), monthly_emails: z.number(), daily_recipients: z.number(), minute_recipients: z.number(),
            contacts: z.number(), broadcasts: z.number(), automations: z.number(), domains: z.number(), members: z.number(), rate_limit_per_second: z.number(),
        }) } },
    }, async req => {
        const p = principalOf(req.principal);
        return req.tenant(async tx => {
            const [monthly] = await tx.select({ n: sql<number>`count(*)::int` }).from(emails).where(and(
                eq(emails.orgId, p.orgId), eq(emails.projectId, p.projectId), eq(emails.stream, 'transactional'), eq(emails.isTest, false),
                sql`${emails.createdAt} >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`,
            ));
            // Admission counts all accepted recipients, including simulations, across every project.
            const [rolling] = await tx.select({
                daily: sql<number>`coalesce(sum(${emails.recipientCount}), 0)::int`,
                minute: sql<number>`coalesce(sum(${emails.recipientCount}) filter (where ${emails.createdAt} > now() - interval '1 minute'), 0)::int`,
            }).from(emails).where(and(eq(emails.orgId, p.orgId), sql`${emails.createdAt} > now() - interval '24 hours'`));
            const [contactCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.orgId, p.orgId), eq(contacts.projectId, p.projectId), isNull(contacts.archivedAt)));
            const [broadcastCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(broadcasts).where(and(eq(broadcasts.orgId, p.orgId), eq(broadcasts.projectId, p.projectId)));
            const [automationCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(automations).where(and(eq(automations.orgId, p.orgId), eq(automations.projectId, p.projectId)));
            const [domainCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(domains).where(and(eq(domains.orgId, p.orgId), eq(domains.projectId, p.projectId), sql`${domains.status} <> 'disabled'`));
            const [memberCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(organizationMembers).where(eq(organizationMembers.orgId, p.orgId));
            return { timezone: 'UTC' as const, monthly_emails: monthly?.n ?? 0, daily_recipients: rolling?.daily ?? 0, minute_recipients: rolling?.minute ?? 0,
                contacts: contactCount?.n ?? 0, broadcasts: broadcastCount?.n ?? 0, automations: automationCount?.n ?? 0, domains: domainCount?.n ?? 0, members: memberCount?.n ?? 0,
                rate_limit_per_second: deps.config.RATE_LIMIT_PER_SECOND };
        });
    });
    r.get('/v1/settings/quotas', { config: { permission: 'org:read', sessionOnly: true }, schema: { tags: ['Settings'], response: { 200: view } } }, async req => {
        const p = principalOf(req.principal);
        const [org] = await deps.dbs.service.select().from(organizations).where(eq(organizations.id, p.orgId));
        return { daily_recipient_limit: org!.dailyRecipientLimit, per_minute_recipient_limit: org!.perMinuteRecipientLimit, unlimited: unlimitedAvailable && org!.localUnlimitedSending !== false, editable: deps.config.NODE_ENV !== 'production', unlimited_available: unlimitedAvailable };
    });
    r.patch('/v1/settings/quotas', { config: { permission: 'org:manage', sessionOnly: true }, schema: { tags: ['Settings'], body: limits, response: { 200: view } } }, async req => {
        if (deps.config.NODE_ENV === 'production') throw new AppError('forbidden', 'Production quotas are managed by the platform administrator');
        if (req.body.unlimited && !unlimitedAvailable) throw new AppError('validation_error', 'Enable LOCAL_UNLIMITED_SENDING in development to use unlimited sending');
        const p = principalOf(req.principal);
        await deps.dbs.service.transaction(async tx => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`quota:${p.orgId}`}, 0))`);
            await tx.update(organizations).set({ dailyRecipientLimit: req.body.daily_recipient_limit, perMinuteRecipientLimit: req.body.per_minute_recipient_limit, localUnlimitedSending: req.body.unlimited, updatedAt: new Date() }).where(eq(organizations.id, p.orgId));
            await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'organization.quotas_updated', targetType: 'organization', targetId: p.orgId });
        });
        return { ...req.body, editable: true, unlimited_available: unlimitedAvailable };
    });
    r.get('/v1/settings/team', { config: { permission: 'members:read', sessionOnly: true }, schema: { tags: ['Settings'], response: { 200: z.object({ id: z.string(), name: z.string(), members: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.string() })) }) } } }, async (req) => {
        const p = principalOf(req.principal);
        return deps.dbs.service.transaction(async (tx) => {
            const members = await tx.select({ id: users.id, name: users.name, email: users.email, role: organizationMembers.role }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.orgId, p.orgId));
            return { id: p.orgId, name: p.kind === 'user' ? p.orgName : '', members };
        });
    });
    r.patch('/v1/settings/team', { config: { permission: 'org:manage', sessionOnly: true }, schema: { tags: ['Settings'], body: z.object({ name: z.string().trim().min(1).max(128) }).strict(), response: { 200: z.object({ id: z.string(), name: z.string() }) } } }, async (req) => {
        const p = principalOf(req.principal);
        return deps.dbs.service.transaction(async (tx) => {
            const [row] = await tx.update(organizations).set({ name: req.body.name, updatedAt: new Date() }).where(eq(organizations.id, p.orgId)).returning();
            await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'organization.renamed', targetType: 'organization', targetId: p.orgId });
            return { id: row!.id, name: row!.name };
        });
    });
}
