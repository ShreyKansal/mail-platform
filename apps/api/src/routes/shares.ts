import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { uuidParam } from '@mp/contracts';
import { writeAudit } from '@mp/core';
import { and, emailContents, emailShares, emails, eq, sql } from '@mp/database';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function shareRoutes(app: FastifyInstance, deps: AppDeps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post('/v1/emails/:id/shares', {
    config: { permission: 'emails:read_content' },
    schema: { tags: ['Emails'], summary: 'Share email content for 48 hours', params: uuidParam,
      response: { 201: z.object({ id: z.string().uuid(), url: z.string().url(), expires_at: z.string() }) } },
  }, async (req, reply) => {
    const p = principalOf(req.principal);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600_000);
    const result = await req.tenant(async (tx) => {
      const [email] = await tx.select({ id: emails.id }).from(emails).where(and(eq(emails.id, req.params.id), eq(emails.orgId, p.orgId), eq(emails.projectId, p.projectId)));
      if (!email) throw new AppError('not_found', 'email not found');
      const [share] = await tx.insert(emailShares).values({ orgId: p.orgId, projectId: p.projectId, emailId: email.id, tokenHash: hash(token), expiresAt }).returning({ id: emailShares.id });
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'email.shared', targetType: 'email', targetId: email.id, requestId: req.id });
      return { id: share!.id, url: `${deps.config.PUBLIC_API_URL.replace(/\/$/, '')}/v1/shared/emails/${token}`, expires_at: expiresAt.toISOString() };
    });
    return reply.status(201).send(result);
  });
  r.delete('/v1/emails/:id/shares/:shareId', {
    config: { permission: 'emails:read_content' },
    schema: { tags: ['Emails'], summary: 'Revoke an email share link', params: z.object({ id: z.string().uuid(), shareId: z.string().uuid() }), response: { 200: z.object({ deleted: z.literal(true) }) } },
  }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const rows = await tx.delete(emailShares).where(and(eq(emailShares.id, req.params.shareId), eq(emailShares.emailId, req.params.id), eq(emailShares.orgId, p.orgId), eq(emailShares.projectId, p.projectId))).returning({ id: emailShares.id });
      if (!rows.length) throw new AppError('not_found', 'share not found');
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'email.share_revoked', targetType: 'email', targetId: req.params.id, requestId: req.id });
      return { deleted: true as const };
    });
  });
  r.get('/v1/shared/emails/:token', {
    config: { public: true },
    schema: { tags: ['Emails'], security: [], summary: 'View an unexpired shared email', params: z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }) },
  }, async (req, reply) => {
    const [row] = await deps.dbs.service.select({ subject: emails.subject, from: emails.fromAddress, html: emailContents.html, text: emailContents.text })
      .from(emailShares).innerJoin(emails, and(eq(emails.id, emailShares.emailId), eq(emails.orgId, emailShares.orgId), eq(emails.projectId, emailShares.projectId)))
      .innerJoin(emailContents, eq(emailContents.emailId, emails.id))
      .where(and(eq(emailShares.tokenHash, hash(req.params.token)), sql`${emailShares.expiresAt} > now()`));
    if (!row) throw new AppError('not_found', 'share not found or expired');
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-robots-tag', 'noindex, nofollow');
    return reply.type('text/html; charset=utf-8').send(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(row.subject)}</title></head><body><h1>${escape(row.subject)}</h1><p>From: ${escape(row.from)}</p>${row.html ? `<iframe title="Email preview" sandbox="" style="width:100%;height:75vh;border:0" srcdoc="${escape(row.html)}"></iframe>` : `<pre>${escape(row.text ?? '')}</pre>`}</body></html>`);
  });
}
