import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createDomainRequest, dkimKeyView, domainView as domainSchema, uuidParam } from '@mp/contracts';
import { applyDomainChecks, checkDomainRecords, createDomain, listDomains, loadDomain, removeDomain, writeAudit } from '@mp/core';
import { and, desc, dkimKeys, domains, eq } from '@mp/database';
import { activateDkimRotation, keyView, startDkimRotation } from '@mp/core';
import { checkRecord } from '@mp/dns-verification';
import { metrics } from '@mp/observability';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';
import { domainView } from '../views';

export function domainRoutes(app: FastifyInstance, deps: AppDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Domains'];
  const keyParams = z.object({ id: z.string().uuid(), keyId: z.string().uuid() });
  r.delete('/v1/domains/:id/dkim-keys/:keyId', { config: { permission: 'domains:manage' }, schema: { tags, summary: 'Cancel an unactivated DKIM rotation', params: keyParams, response: { 200: z.object({ deleted: z.literal(true) }) } } }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [domain] = await tx.select().from(domains).where(and(eq(domains.id, req.params.id), eq(domains.orgId, p.orgId), eq(domains.projectId, p.projectId))).for('update');
      if (!domain) throw new AppError('not_found', 'domain not found');
      const active = await tx.select({ id: dkimKeys.id }).from(dkimKeys).where(and(eq(dkimKeys.domainId, domain.id), eq(dkimKeys.status, 'active')));
      if (!active.length) throw new AppError('invalid_state', 'initial onboarding key cannot be removed');
      const deleted = await tx.delete(dkimKeys).where(and(eq(dkimKeys.id, req.params.keyId), eq(dkimKeys.domainId, domain.id), eq(dkimKeys.status, 'pending'))).returning({ id: dkimKeys.id });
      if (!deleted.length) throw new AppError('not_found', 'pending rotation not found');
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'domain.dkim_rotation_cancelled', targetType: 'domain', targetId: domain.id, requestId: req.id });
      return { deleted: true as const };
    });
  });
  r.get('/v1/domains/:id/dkim-keys', { config: { permission: 'domains:read' }, schema: { tags, summary: 'List public DKIM selectors and rotation state', params: uuidParam, response: { 200: z.object({ data: z.array(dkimKeyView) }) } } }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [domain] = await tx.select().from(domains).where(and(eq(domains.id, req.params.id), eq(domains.orgId, p.orgId), eq(domains.projectId, p.projectId)));
      if (!domain) throw new AppError('not_found', 'domain not found');
      const keys = await tx.select().from(dkimKeys).where(eq(dkimKeys.domainId, domain.id)).orderBy(desc(dkimKeys.createdAt));
      return { data: keys.map((key) => keyView(key, domain.name)) };
    });
  });
  r.post('/v1/domains/:id/dkim-keys', { config: { permission: 'domains:manage' }, schema: { tags, summary: 'Start DKIM rotation', params: uuidParam, response: { 201: dkimKeyView } } }, async (req, reply) => {
    const p = principalOf(req.principal);
    const key = await req.tenant((tx) => startDkimRotation(tx, deps.core, p.orgId, p.projectId, req.params.id, actorOf(p)));
    return reply.status(201).send(key);
  });
  r.post('/v1/domains/:id/dkim-keys/:keyId/verify', { config: { permission: 'domains:manage' }, schema: { tags, summary: 'Verify and activate a pending DKIM selector', params: keyParams,
    response: { 200: z.object({ activated: z.boolean(), check: z.string(), detail: z.string(), key: dkimKeyView }) } } }, async (req) => {
    const p = principalOf(req.principal);
    const view = await req.tenant(async (tx) => {
      const [row] = await tx.select({ key: dkimKeys, domain: domains }).from(dkimKeys).innerJoin(domains, eq(domains.id, dkimKeys.domainId))
        .where(and(eq(dkimKeys.id, req.params.keyId), eq(domains.id, req.params.id), eq(domains.orgId, p.orgId), eq(domains.projectId, p.projectId)));
      if (!row) throw new AppError('not_found', 'DKIM key not found');
      return keyView(row.key, row.domain.name);
    });
    const result = await checkRecord({ purpose: 'dkim', ...view.record, priority: null, required: true }, deps.dns);
    if (result.status !== 'valid') return { activated: false, check: result.status, detail: result.detail, key: view };
    const key = await req.tenant((tx) => activateDkimRotation(tx, p.orgId, p.projectId, req.params.id, req.params.keyId, actorOf(p)));
    return { activated: true, check: result.status, detail: result.detail, key };
  });
  r.patch('/v1/domains/:id', { config: { permission: 'domains:manage' }, schema: { tags, summary: 'Configure outbound TLS policy', params: uuidParam,
    body: z.object({ tls_policy: z.enum(['opportunistic', 'enforced']) }).strict(), response: { 200: domainSchema } } }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const rows = await tx.update(domains).set({ tlsPolicy: req.body.tls_policy, updatedAt: new Date() })
        .where(and(eq(domains.id, req.params.id), eq(domains.orgId, p.orgId), eq(domains.projectId, p.projectId))).returning({ id: domains.id });
      if (!rows.length) throw new AppError('not_found', 'domain not found');
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'domain.tls_updated', targetType: 'domain', targetId: req.params.id, requestId: req.id, metadata: { tls_policy: req.body.tls_policy } });
      return domainView(await loadDomain(tx, p.orgId, req.params.id));
    });
  });

  r.post(
    '/v1/domains',
    {
      config: { permission: 'domains:manage' },
      schema: { tags, summary: 'Add a sending domain', body: createDomainRequest, response: { 201: domainSchema } },
    },
    async (req, reply) => {
      const p = principalOf(req.principal);
      const view = await req.tenant(async (tx) => {
        const domain = await createDomain(tx, deps.core, {
          orgId: p.orgId,
          projectId: p.projectId,
          name: req.body.name,
          returnPathLabel: req.body.return_path_label,
          actor: actorOf(p),
        });
        return domainView(await loadDomain(tx, p.orgId, domain.id));
      });
      return reply.status(201).send(view);
    },
  );

  r.get(
    '/v1/domains',
    { config: { permission: 'domains:read' }, schema: { tags, summary: 'List domains', response: { 200: z.object({ data: z.array(domainSchema) }) } } },
    async (req) => {
      const p = principalOf(req.principal);
      const rows = await req.tenant((tx) => listDomains(tx, p.orgId, p.projectId));
      return { data: rows.map(domainView) };
    },
  );

  r.get(
    '/v1/domains/:id',
    { config: { permission: 'domains:read' }, schema: { tags, summary: 'Get a domain', params: uuidParam, response: { 200: domainSchema } } },
    async (req) => {
      const p = principalOf(req.principal);
      return domainView(await req.tenant((tx) => loadDomain(tx, p.orgId, req.params.id)));
    },
  );

  r.post(
    '/v1/domains/:id/verify',
    {
      config: { permission: 'domains:manage' },
      schema: { tags, summary: 'Check DNS records now', params: uuidParam, response: { 200: domainSchema } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const throttleKey = `verify:${req.params.id}`;
      const fresh = await deps.redis.set(throttleKey, '1', 'EX', 10, 'NX').catch(() => 'OK');
      if (fresh !== 'OK') throw new AppError('rate_limited', 'verification was requested less than 10 seconds ago');

      // DNS lookups happen outside the transaction.
      const { records } = await req.tenant((tx) => loadDomain(tx, p.orgId, req.params.id));
      const checks = await checkDomainRecords(records, deps.dns);
      for (const [purpose, c] of Object.entries(checks)) {
        if (c.status !== 'valid') metrics.dnsVerificationFailures.inc({ purpose, status: c.status });
      }
      return req.tenant(async (tx) => {
        await applyDomainChecks(tx, p.orgId, req.params.id, checks, new Date(), records.find((record) => record.purpose === 'dkim')?.host);
        return domainView(await loadDomain(tx, p.orgId, req.params.id));
      });
    },
  );

  r.delete(
    '/v1/domains/:id',
    {
      config: { permission: 'domains:manage' },
      schema: { tags, summary: 'Remove a domain', params: uuidParam, response: { 200: z.object({ id: z.string(), result: z.enum(['deleted', 'disabled']) }) } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const result = await req.tenant((tx) => removeDomain(tx, p.orgId, req.params.id, actorOf(p)));
      return { id: req.params.id, result };
    },
  );
}
