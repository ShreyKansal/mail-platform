import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiKeyView as apiKeySchema,
  createApiKeyRequest,
  createApiKeyResponse,
  createSmtpCredentialRequest,
  createSmtpCredentialResponse,
  smtpCredentialView as smtpSchema,
  uuidParam,
} from '@mp/contracts';
import { generateApiKey, generateSmtpCredential, writeAudit } from '@mp/core';
import { and, apiKeys, desc, domains, eq, isNull, smtpCredentials, type Tx } from '@mp/database';
import { AppError } from '@mp/shared';
import { actorOf, principalOf, type AppDeps } from '../context';
import { apiKeyView, smtpCredentialView } from '../views';

async function assertDomainInProject(tx: Tx, orgId: string, projectId: string, domainId: string | undefined) {
  if (!domainId) return;
  const [d] = await tx
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.orgId, orgId), eq(domains.projectId, projectId)));
  if (!d) throw new AppError('validation_error', 'domain_id does not belong to this project', [{ path: 'domain_id', message: 'unknown domain' }]);
}

function validCidr(c: string): boolean {
  const [ip, bits, extra] = c.split('/');
  if (extra !== undefined || !ip) return false;
  const v = isIP(ip);
  if (!v) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return Number.isInteger(n) && n >= 0 && n <= (v === 4 ? 32 : 128);
}

export function credentialRoutes(app: FastifyInstance, _deps: AppDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ---------------------------------------------------------------- API keys
  r.post(
    '/v1/api-keys',
    {
      config: { permission: 'api_keys:manage' },
      schema: { tags: ['API keys'], summary: 'Create an API key (token shown once)', body: createApiKeyRequest, response: { 201: createApiKeyResponse } },
    },
    async (req, reply) => {
      const p = principalOf(req.principal);
      const key = generateApiKey();
      const scopes = [req.body.scope];
      const row = await req.tenant(async (tx) => {
        await assertDomainInProject(tx, p.orgId, p.projectId, req.body.domain_id);
        const [created] = await tx
          .insert(apiKeys)
          .values({
            orgId: p.orgId,
            projectId: p.projectId,
            name: req.body.name,
            prefix: key.displayPrefix,
            keyHash: key.hash,
            scopes,
            domainId: req.body.domain_id ?? null,
            createdByUserId: p.kind === 'user' ? p.userId : null,
            expiresAt: req.body.expires_at ? new Date(req.body.expires_at) : null,
          })
          .returning();
        await writeAudit(tx, {
          orgId: p.orgId,
          actor: actorOf(p),
          action: 'api_key.created',
          targetType: 'api_key',
          targetId: created!.id,
          ip: req.ip,
          requestId: req.id,
          metadata: { name: req.body.name, scopes },
        });
        return created!;
      });
      return reply.status(201).send({ ...apiKeyView(row), token: key.token });
    },
  );

  r.get(
    '/v1/api-keys',
    { config: { permission: 'api_keys:read' }, schema: { tags: ['API keys'], summary: 'List API keys', response: { 200: z.object({ data: z.array(apiKeySchema) }) } } },
    async (req) => {
      const p = principalOf(req.principal);
      const rows = await req.tenant((tx) =>
        tx.select().from(apiKeys).where(and(eq(apiKeys.orgId, p.orgId), eq(apiKeys.projectId, p.projectId))).orderBy(desc(apiKeys.createdAt)),
      );
      return { data: rows.map(apiKeyView) };
    },
  );

  r.delete(
    '/v1/api-keys/:id',
    { config: { permission: 'api_keys:manage' }, schema: { tags: ['API keys'], summary: 'Revoke an API key', params: uuidParam, response: { 200: apiKeySchema } } },
    async (req) => {
      const p = principalOf(req.principal);
      return req.tenant(async (tx) => {
        const [row] = await tx
          .update(apiKeys)
          .set({ revokedAt: new Date() })
          .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.orgId, p.orgId), isNull(apiKeys.revokedAt)))
          .returning();
        if (!row) throw new AppError('not_found', 'API key not found or already revoked');
        await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'api_key.revoked', targetType: 'api_key', targetId: row.id, ip: req.ip, requestId: req.id });
        return apiKeyView(row);
      });
    },
  );

  r.patch('/v1/api-keys/:id', {
    config: { permission: 'api_keys:manage' },
    schema: { tags: ['API keys'], summary: 'Rename an API key', params: uuidParam, body: z.object({ name: z.string().trim().min(1).max(100) }).strict(), response: { 200: apiKeySchema } },
  }, async (req) => {
    const p = principalOf(req.principal);
    return req.tenant(async (tx) => {
      const [row] = await tx.update(apiKeys).set({ name: req.body.name }).where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.orgId, p.orgId), eq(apiKeys.projectId, p.projectId))).returning();
      if (!row) throw new AppError('not_found', 'API key not found');
      await writeAudit(tx, { orgId: p.orgId, actor: actorOf(p), action: 'api_key.renamed', targetType: 'api_key', targetId: row.id, requestId: req.id });
      return apiKeyView(row);
    });
  });

  // -------------------------------------------------------- SMTP credentials
  r.post(
    '/v1/smtp-credentials',
    {
      config: { permission: 'smtp_credentials:manage' },
      schema: {
        tags: ['SMTP credentials'],
        summary: 'Create SMTP credentials (password shown once)',
        body: createSmtpCredentialRequest,
        response: { 201: createSmtpCredentialResponse },
      },
    },
    async (req, reply) => {
      const p = principalOf(req.principal);
      const bad = (req.body.allowed_cidrs ?? []).filter((c) => !validCidr(c));
      if (bad.length) throw new AppError('validation_error', `invalid CIDR: ${bad.join(', ')}`, [{ path: 'allowed_cidrs', message: 'invalid CIDR' }]);
      const cred = generateSmtpCredential();
      const row = await req.tenant(async (tx) => {
        await assertDomainInProject(tx, p.orgId, p.projectId, req.body.domain_id);
        const [created] = await tx
          .insert(smtpCredentials)
          .values({
            orgId: p.orgId,
            projectId: p.projectId,
            name: req.body.name,
            username: cred.username,
            passwordHash: cred.passwordHash,
            domainId: req.body.domain_id ?? null,
            allowedCidrs: req.body.allowed_cidrs?.length ? req.body.allowed_cidrs : null,
            createdByUserId: p.kind === 'user' ? p.userId : null,
          })
          .returning();
        await writeAudit(tx, {
          orgId: p.orgId,
          actor: actorOf(p),
          action: 'smtp_credential.created',
          targetType: 'smtp_credential',
          targetId: created!.id,
          ip: req.ip,
          requestId: req.id,
        });
        return created!;
      });
      return reply.status(201).send({ ...smtpCredentialView(row), password: cred.password });
    },
  );

  r.get(
    '/v1/smtp-credentials',
    {
      config: { permission: 'smtp_credentials:read' },
      schema: { tags: ['SMTP credentials'], summary: 'List SMTP credentials', response: { 200: z.object({ data: z.array(smtpSchema) }) } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      const rows = await req.tenant((tx) =>
        tx
          .select()
          .from(smtpCredentials)
          .where(and(eq(smtpCredentials.orgId, p.orgId), eq(smtpCredentials.projectId, p.projectId)))
          .orderBy(desc(smtpCredentials.createdAt)),
      );
      return { data: rows.map(smtpCredentialView) };
    },
  );

  r.delete(
    '/v1/smtp-credentials/:id',
    {
      config: { permission: 'smtp_credentials:manage' },
      schema: { tags: ['SMTP credentials'], summary: 'Revoke SMTP credentials', params: uuidParam, response: { 200: smtpSchema } },
    },
    async (req) => {
      const p = principalOf(req.principal);
      return req.tenant(async (tx) => {
        const [row] = await tx
          .update(smtpCredentials)
          .set({ revokedAt: new Date() })
          .where(and(eq(smtpCredentials.id, req.params.id), eq(smtpCredentials.orgId, p.orgId), isNull(smtpCredentials.revokedAt)))
          .returning();
        if (!row) throw new AppError('not_found', 'SMTP credential not found or already revoked');
        await writeAudit(tx, {
          orgId: p.orgId,
          actor: actorOf(p),
          action: 'smtp_credential.revoked',
          targetType: 'smtp_credential',
          targetId: row.id,
          ip: req.ip,
          requestId: req.id,
        });
        return smtpCredentialView(row);
      });
    },
  );
}
