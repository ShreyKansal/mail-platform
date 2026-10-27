import type { Redis } from 'ioredis';
import type { CoreConfig, ApiKeyPrincipal } from '@mp/core';
import type { Databases, Tx } from '@mp/database';
import type { VerifyContext } from '@mp/dns-verification';
import type { Permission } from '@mp/permissions';
import type { ApiConfig } from './config';
import type { UserPrincipal } from './auth/sessions';

export interface AppDeps {
  config: ApiConfig;
  dbs: Databases;
  redis: Redis;
  core: CoreConfig;
  dns: VerifyContext;
}

export type Principal = UserPrincipal | ApiKeyPrincipal;

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
    /** Runs `fn` in an RLS-bound transaction for the caller's organization. */
    tenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  }
  interface FastifyContextConfig {
    /** No authentication required. */
    public?: boolean;
    /** Required permission; enforced server-side for every caller type. */
    permission?: Permission;
    /** Only dashboard sessions (not API keys) may call this route. */
    sessionOnly?: boolean;
  }
}

/** Principal of an authenticated route (the auth hook guarantees it is set). */
export function principalOf(p: Principal | null): Principal {
  if (!p) throw new Error('route reached without an authenticated principal');
  return p;
}

export const actorOf = (p: Principal) =>
  p.kind === 'user' ? ({ type: 'user', id: p.userId } as const) : ({ type: 'api_key', id: p.keyId } as const);
