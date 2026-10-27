import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface Databases {
  /**
   * Connected as `mp_app`: row-level security is enforced. Only usable inside
   * `withTenant`, which binds the transaction to one organization.
   */
  app: Db;
  /**
   * Connected as `mp_service` (BYPASSRLS). Used by delivery workers and by
   * authentication lookups that run before a tenant is known. Every query
   * issued through it must filter by tenant explicitly.
   */
  service: Db;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  appUrl: string;
  serviceUrl: string;
  appPoolSize?: number;
  servicePoolSize?: number;
  applicationName: string;
}

export function createDatabases(opts: DatabaseOptions): Databases {
  const appPool = new pg.Pool({
    connectionString: opts.appUrl,
    max: opts.appPoolSize ?? 10,
    application_name: opts.applicationName,
  });
  const servicePool = new pg.Pool({
    connectionString: opts.serviceUrl,
    max: opts.servicePoolSize ?? 10,
    application_name: `${opts.applicationName}:service`,
  });
  return {
    app: drizzle({ client: appPool, schema }),
    service: drizzle({ client: servicePool, schema }),
    async close() {
      await Promise.all([appPool.end(), servicePool.end()]);
    },
  };
}

/** Workers only ever use the service role. */
export function createServiceDatabase(url: string, applicationName: string, poolSize = 10): { db: Db; close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: poolSize, application_name: applicationName });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}

/**
 * Runs `fn` in a transaction on the RLS-enforced connection with the tenant
 * bound via a transaction-local setting. RLS policies compare every row's
 * `org_id` against it, so a missing WHERE clause cannot leak another tenant.
 */
export async function withTenant<T>(db: Db, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Postgres unique_violation, optionally for a specific constraint/index. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = findPgError(err);
  return !!e && e.code === '23505' && (!constraint || e.constraint === constraint);
}

function findPgError(err: unknown): { code?: string; constraint?: string } | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur && typeof cur === 'object'; i++) {
    const c = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof c.code === 'string' && /^[0-9A-Z]{5}$/.test(c.code)) {
      return { code: c.code, constraint: typeof c.constraint === 'string' ? c.constraint : undefined };
    }
    cur = c.cause;
  }
  return undefined;
}
