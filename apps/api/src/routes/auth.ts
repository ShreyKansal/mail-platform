import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loginRequest, sessionView, signupRequest } from '@mp/contracts';
import { writeAudit } from '@mp/core';
import { eq, organizationMembers, organizations, projects, sql, users, workspaces } from '@mp/database';
import { AppError, randomToken } from '@mp/shared';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { createSession, revokeSession, SESSION_COOKIE, type UserPrincipal } from '../auth/sessions';
import { principalOf, type AppDeps } from '../context';

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MINUTES = 15;

function sessionBody(p: UserPrincipal, localUnlimited = false) {
  return {
    user: { id: p.userId, email: p.email, name: p.name },
    organization: {
      id: p.orgId,
      name: p.orgName,
      status: p.orgStatus,
      sending_tier: p.sendingTier,
      daily_recipient_limit: p.dailyRecipientLimit,
      local_unlimited_sending: localUnlimited,
    },
    project: { id: p.projectId, name: p.projectName },
    role: p.role,
    permissions: [...p.permissions].sort(),
  };
}

const slugify = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'org'}-${randomToken(4)}`;

/** Fixed-window counter in Redis; fails open (account lockout still applies). */
async function throttle(deps: AppDeps, key: string, limit: number, windowSeconds: number): Promise<void> {
  try {
    const k = `throttle:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const res = await deps.redis.multi().incr(k).expire(k, windowSeconds).exec();
    if (Number(res?.[0]?.[1] ?? 0) > limit) throw new AppError('rate_limited', 'too many attempts; try again later');
  } catch (err) {
    if (err instanceof AppError) throw err;
  }
}

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: deps.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: deps.config.SESSION_TTL_HOURS * 3600,
    });

  r.post(
    '/auth/signup',
    {
      config: { public: true },
      schema: { tags: ['Dashboard auth'], summary: 'Create an account and organization', body: signupRequest, response: { 201: z.object({ ok: z.literal(true) }) } },
    },
    async (req, reply) => {
      if (!deps.config.ALLOW_PUBLIC_SIGNUP) throw new AppError('forbidden', 'public registration is closed');
      await throttle(deps, `signup:${req.ip}`, 5, 3600);
      const body = req.body;
      const passwordHash = await hashPassword(body.password);

      const { userId, orgId } = await deps.dbs.service.transaction(async (tx) => {
        const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${body.email.toLowerCase()}`);
        if (existing) throw new AppError('conflict', 'an account with this email already exists');
        const [user] = await tx.insert(users).values({ email: body.email.toLowerCase(), name: body.name, passwordHash }).returning();
        const [org] = await tx.insert(organizations).values({ name: body.organization_name, slug: slugify(body.organization_name) }).returning();
        await tx.insert(organizationMembers).values({ orgId: org!.id, userId: user!.id, role: 'owner' });
        const [ws] = await tx.insert(workspaces).values({ orgId: org!.id, name: 'Default' }).returning();
        await tx.insert(projects).values({ orgId: org!.id, workspaceId: ws!.id, name: 'Default' });
        await writeAudit(tx, {
          orgId: org!.id,
          actor: { type: 'user', id: user!.id },
          action: 'organization.created',
          targetType: 'organization',
          targetId: org!.id,
          ip: req.ip,
          requestId: req.id,
        });
        return { userId: user!.id, orgId: org!.id };
      });

      const token = await createSession(deps.dbs.service, {
        userId,
        orgId,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        ttlHours: deps.config.SESSION_TTL_HOURS,
      });
      setCookie(reply, token);
      return reply.status(201).send({ ok: true });
    },
  );

  r.post(
    '/auth/login',
    {
      config: { public: true },
      schema: { tags: ['Dashboard auth'], summary: 'Sign in', body: loginRequest, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req, reply) => {
      await throttle(deps, `login:${req.ip}`, 20, 60);
      const email = req.body.email.toLowerCase();
      const [user] = await deps.dbs.service.select().from(users).where(sql`lower(${users.email}) = ${email}`);
      const invalid = new AppError('unauthorized', 'invalid email or password');

      if (user?.lockedUntil && user.lockedUntil > new Date()) {
        await verifyPassword(null, req.body.password);
        throw new AppError('rate_limited', 'too many failed attempts; try again later');
      }
      const ok = await verifyPassword(user?.passwordHash ?? null, req.body.password);
      if (!user || !ok) {
        if (user) {
          // The counter only resets on a successful login, so once the threshold is reached every
          // further failure re-locks the account (one guess per lockout window, not ten).
          const failures = user.failedLoginCount + 1;
          await deps.dbs.service
            .update(users)
            .set({
              failedLoginCount: failures,
              lockedUntil: failures >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
            })
            .where(eq(users.id, user.id));
        }
        throw invalid;
      }

      const [membership] = await deps.dbs.service
        .select({ orgId: organizationMembers.orgId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id))
        .orderBy(organizationMembers.createdAt)
        .limit(1);
      if (!membership) throw new AppError('forbidden', 'this account is not a member of any organization');

      await deps.dbs.service.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
      const token = await createSession(deps.dbs.service, {
        userId: user.id,
        orgId: membership.orgId,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        ttlHours: deps.config.SESSION_TTL_HOURS,
      });
      setCookie(reply, token);
      return { ok: true as const };
    },
  );

  r.post(
    '/auth/logout',
    { config: { sessionOnly: true }, schema: { tags: ['Dashboard auth'], summary: 'Sign out', response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req, reply) => {
      const p = principalOf(req.principal);
      if (p.kind === 'user') await revokeSession(deps.dbs.service, p.sessionId);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true as const };
    },
  );

  r.get(
    '/auth/session',
    { config: { sessionOnly: true }, schema: { tags: ['Dashboard auth'], summary: 'Current session', response: { 200: sessionView } } },
    async (req) => {
      const p = principalOf(req.principal);
      if (p.kind !== 'user') throw new AppError('forbidden', 'session required');
      const [org] = await deps.dbs.service.select({ unlimited: organizations.localUnlimitedSending }).from(organizations).where(eq(organizations.id, p.orgId));
      return sessionBody(p, !!deps.core.localUnlimitedSending && org?.unlimited !== false);
    },
  );
}
