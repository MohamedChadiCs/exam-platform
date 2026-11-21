import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

export async function migrate(connectionString, log = () => {}) {
  const isRemote = connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
  const client = new pg.Client({
    connectionString,
    ...(isRemote && { ssl: { rejectUnauthorized: false } }),
  });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const folders = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory()).map((d) => d.name).sort();
    let applied = 0;
    for (const name of folders) {
      if (done.has(name)) continue;
      const sql = await readFile(join(dir, name, 'migration.sql'), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        log(`applied ${name}`);
        applied++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${name} failed: ${err.message}`);
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}
