import { and, apiKeys, eq, gt, isNull, or, organizations, smtpCredentials, sql, type DbOrTx } from '@mp/database';
import { permissionsForScopes, type Permission } from '@mp/permissions';
import { randomToken, sha256Hex } from '@mp/shared';

/**
 * API keys and SMTP passwords are 160+ bit random secrets, so a fast hash
 * (SHA-256) is sufficient at rest — there is nothing to brute-force.
 * User passwords are low-entropy and use Argon2id instead (see apps/api auth).
 */
export const API_KEY_PREFIX = 'mp_';

export interface GeneratedSecret {
  token: string;
  hash: string;
  displayPrefix: string;
}

export function generateApiKey(): GeneratedSecret {
  const token = `${API_KEY_PREFIX}${randomToken(24)}`;
  return { token, hash: sha256Hex(token), displayPrefix: token.slice(0, 10) };
}

export function generateSmtpCredential(): { username: string; password: string; passwordHash: string } {
  const username = `mp_smtp_${randomToken(10)}`;
  const password = randomToken(24);
  return { username, password, passwordHash: sha256Hex(password) };
}

export interface ApiKeyPrincipal {
  kind: 'api_key';
  keyId: string;
  orgId: string;
  projectId: string;
  orgStatus: 'active' | 'pending_review' | 'suspended';
  permissions: Set<Permission>;
  restrictDomainId: string | null;
}

/**
 * Resolves a bearer token. Runs on the service connection because the tenant
 * is not known until the key is found. Returns null for unknown, revoked or
 * expired keys (callers respond with a uniform 401).
 */
export async function authenticateApiKey(service: DbOrTx, token: string, now = new Date()): Promise<ApiKeyPrincipal | null> {
  if (!token.startsWith(API_KEY_PREFIX) || token.length > 100) return null;
  const [row] = await service
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      projectId: apiKeys.projectId,
      scopes: apiKeys.scopes,
      domainId: apiKeys.domainId,
      lastUsedAt: apiKeys.lastUsedAt,
      orgStatus: organizations.status,
    })
    .from(apiKeys)
    .innerJoin(organizations, eq(organizations.id, apiKeys.orgId))
    .where(
      and(
        eq(apiKeys.keyHash, sha256Hex(token)),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
      ),
    );
  if (!row) return null;
  // Throttled last-used tracking: at most one write per key per minute.
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await service.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.id));
  }
  return {
    kind: 'api_key',
    keyId: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    orgStatus: row.orgStatus,
    permissions: permissionsForScopes(row.scopes),
    restrictDomainId: row.domainId,
  };
}

export interface SmtpPrincipal {
  kind: 'smtp_credential';
  credentialId: string;
  orgId: string;
  projectId: string;
  orgStatus: 'active' | 'pending_review' | 'suspended';
  restrictDomainId: string | null;
  allowedCidrs: string[] | null;
}

export async function authenticateSmtpCredential(service: DbOrTx, username: string, password: string): Promise<SmtpPrincipal | null> {
  if (username.length > 100 || password.length > 200) return null;
  const [row] = await service
    .select({
      id: smtpCredentials.id,
      orgId: smtpCredentials.orgId,
      projectId: smtpCredentials.projectId,
      domainId: smtpCredentials.domainId,
      allowedCidrs: smtpCredentials.allowedCidrs,
      orgStatus: organizations.status,
    })
    .from(smtpCredentials)
    .innerJoin(organizations, eq(organizations.id, smtpCredentials.orgId))
    .where(
      and(
        eq(smtpCredentials.username, username),
        eq(smtpCredentials.passwordHash, sha256Hex(password)),
        isNull(smtpCredentials.revokedAt),
      ),
    );
  if (!row) return null;
  await service.update(smtpCredentials).set({ lastUsedAt: sql`now()` }).where(eq(smtpCredentials.id, row.id));
  return {
    kind: 'smtp_credential',
    credentialId: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    orgStatus: row.orgStatus,
    restrictDomainId: row.domainId,
    allowedCidrs: row.allowedCidrs,
  };
}
