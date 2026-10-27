import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * Applies migrations as the schema owner. The owner role is distinct from the
 * runtime roles (`mp_app`, `mp_service`) which only receive DML grants.
 */
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error('DATABASE_MIGRATION_URL is required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
  console.log('migrations applied');
} finally {
  await pool.end();
}
