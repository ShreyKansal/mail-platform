import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import { ROOT, TEST_DB } from './env';

function portOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const s = createConnection({ host: '127.0.0.1', port });
    s.once('connect', () => (s.destroy(), done(true)));
    s.once('error', () => done(false));
  });
}

/**
 * Verifies the docker-compose stack is up, applies migrations to the test
 * database and truncates every table so each run starts clean.
 */
export default async function setup(): Promise<void> {
  const required: Array<[string, number]> = [
    ['postgres', 5432],
    ['redis', 6379],
    ['postfix', 10025],
    ['mailpit', 8025],
  ];
  for (const [name, port] of required) {
    if (!(await portOpen(port))) throw new Error(`${name} is not reachable on 127.0.0.1:${port}; run \`pnpm dev:infra\` first`);
  }
  if (await portOpen(2525)) {
    throw new Error('port 2525 is in use (is the dev bounce-processor running?); the test suite runs its own bounce server there');
  }

  execFileSync(process.execPath, ['--import', 'tsx', resolve(ROOT, 'packages/database/src/migrate.ts')], {
    env: { ...process.env, DATABASE_MIGRATION_URL: TEST_DB.owner },
    stdio: 'inherit',
    cwd: resolve(ROOT, 'packages/database'),
  });

  const client = new pg.Client({ connectionString: TEST_DB.owner });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    if (rows.length) await client.query(`truncate table ${rows.map((r) => `"${r.tablename}"`).join(', ')} cascade`);
  } finally {
    await client.end();
  }
}
