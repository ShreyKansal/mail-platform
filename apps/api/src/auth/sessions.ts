import { randomToken, sha256Hex } from '@mp/shared';
import {
  and,
  asc,
  eq,
  gt,
  isNull,
  organizationMembers,
  organizations,
  projects,
  sql,
  userSessions,
  users,
  type Db,
} from '@mp/database';
import { permissionsForRole, type MemberRole, type Permission } from '@mp/permissions';

export const SESSION_COOKIE = 'mp_session';

export interface UserPrincipal {
  kind: 'user';
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  orgStatus: 'active' | 'pending_review' | 'suspended';
  sendingTier: string;
  dailyRecipientLimit: number;
  projectId: string;
  projectName: string;
  role: MemberRole;
  permissions: ReadonlySet<Permission>;
}

export async function createSession(
  service: Db,
  input: { userId: string; orgId: string; ip: string | null; userAgent: string | null; ttlHours: number },
): Promise<string> {
  const token = randomToken(32);
  await service.insert(userSessions).values({
    userId: input.userId,
    tokenHash: sha256Hex(token),
    activeOrgId: input.orgId,
    ip: input.ip,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + input.ttlHours * 3600_000),
  });
  return token;
}

/**
 * Resolves a session cookie to a principal. The organization membership is
 * re-read on every request so role changes and removals take effect immediately.
 */
export async function resolveSession(service: Db, token: string): Promise<UserPrincipal | null> {
  if (!token || token.length > 128) return null;
  const [row] = await service
    .select({
      sessionId: userSessions.id,
      lastSeenAt: userSessions.lastSeenAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      orgId: organizations.id,
      orgName: organizations.name,
      orgStatus: organizations.status,
      sendingTier: organizations.sendingTier,
      dailyRecipientLimit: organizations.dailyRecipientLimit,
      role: organizationMembers.role,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .innerJoin(organizations, eq(organizations.id, userSessions.activeOrgId))
    .innerJoin(
      organizationMembers,
      and(eq(organizationMembers.orgId, organizations.id), eq(organizationMembers.userId, users.id)),
    )
    .where(and(eq(userSessions.tokenHash, sha256Hex(token)), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, sql`now()`)));
  if (!row) return null;

  const [project] = await service
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.orgId, row.orgId))
    .orderBy(asc(projects.createdAt))
    .limit(1);
  if (!project) return null;

  if (Date.now() - row.lastSeenAt.getTime() > 60_000) {
    await service.update(userSessions).set({ lastSeenAt: new Date() }).where(eq(userSessions.id, row.sessionId));
  }
  return {
    kind: 'user',
    userId: row.userId,
    sessionId: row.sessionId,
    email: row.email,
    name: row.name,
    orgId: row.orgId,
    orgName: row.orgName,
    orgStatus: row.orgStatus,
    sendingTier: row.sendingTier,
    dailyRecipientLimit: row.dailyRecipientLimit,
    projectId: project.id,
    projectName: project.name,
    role: row.role,
    permissions: permissionsForRole(row.role),
  };
}

export async function revokeSession(service: Db, sessionId: string): Promise<void> {
  await service.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.id, sessionId));
}
