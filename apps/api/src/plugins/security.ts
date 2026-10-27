import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticateApiKey } from '@mp/core';
import { withTenant } from '@mp/database';
import { AppError } from '@mp/shared';
import { resolveSession, SESSION_COOKIE } from '../auth/sessions';
import type { AppDeps, Principal } from '../context';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const CSRF_HEADER = 'x-mp-csrf';

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m?.[1] ?? null;
}

/**
 * Authentication, authorization, CSRF and rate limiting, in that order.
 *
 * - API clients authenticate with `Authorization: Bearer mp_…` (no cookies, so no CSRF surface).
 * - The dashboard authenticates with an HttpOnly session cookie. Unsafe methods
 *   additionally require the `x-mp-csrf` header (forcing a CORS preflight for
 *   cross-site callers) and, when present, an Origin equal to DASHBOARD_ORIGIN.
 */
export function registerSecurity(app: FastifyInstance, deps: AppDeps): void {
  app.decorateRequest('principal', null);
  app.decorateRequest('tenant', function (this: FastifyRequest, fn) {
    const p = this.principal;
    if (!p) throw new AppError('unauthorized', 'authentication required');
    return withTenant(deps.dbs.app, p.orgId, fn);
  });

  app.addHook('onRequest', async (req, reply) => {
    const config = req.routeOptions.config;
    if (!req.routeOptions.url) return; // 404s fall through to the not-found handler
    if (req.routeOptions.url.startsWith('/docs')) return; // public API reference (OpenAPI + UI)

    let principal: Principal | null = null;
    let viaCookie = false;
    const token = bearer(req);
    if (token) {
      principal = await authenticateApiKey(deps.dbs.service, token);
      if (!principal) throw new AppError('unauthorized', 'invalid, revoked or expired API key');
    } else {
      const cookie = req.cookies[SESSION_COOKIE];
      if (cookie) {
        principal = await resolveSession(deps.dbs.service, cookie);
        viaCookie = !!principal;
        if (!principal) reply.clearCookie(SESSION_COOKIE, { path: '/' });
      }
    }
    req.principal = principal;

    if (config.public) return;
    if (!principal) throw new AppError('unauthorized', 'authentication required');
    if (config.sessionOnly && principal.kind !== 'user') {
      throw new AppError('forbidden', 'this endpoint is only available to dashboard users');
    }
    if (config.permission && !principal.permissions.has(config.permission)) {
      throw new AppError('forbidden', `missing permission ${config.permission}`);
    }

    if (viaCookie && UNSAFE.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== deps.config.DASHBOARD_ORIGIN) throw new AppError('forbidden', 'cross-origin request rejected');
      if (req.headers[CSRF_HEADER] !== '1') throw new AppError('forbidden', `missing ${CSRF_HEADER} header`);
    }

    await rateLimit(deps, principal, reply);
  });
}

async function rateLimit(deps: AppDeps, p: Principal, reply: { header: (k: string, v: string) => unknown }): Promise<void> {
  const subject = p.kind === 'api_key' ? `k:${p.keyId}` : `u:${p.userId}`;
  const second = Math.floor(Date.now() / 1000);
  const key = `rl:${subject}:${second}`;
  let count: number;
  try {
    const res = await deps.redis.multi().incr(key).expire(key, 2).exec();
    count = Number(res?.[0]?.[1] ?? 0);
  } catch {
    // Fail open: per-tenant quotas are still enforced transactionally in the database.
    return;
  }
  const limit = deps.config.RATE_LIMIT_PER_SECOND;
  reply.header('x-ratelimit-limit', String(limit));
  reply.header('x-ratelimit-remaining', String(Math.max(0, limit - count)));
  if (count > limit) {
    reply.header('retry-after', '1');
    throw new AppError('rate_limited', `rate limit of ${limit} requests per second exceeded`);
  }
}
