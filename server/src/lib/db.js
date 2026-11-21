import pg from 'pg';
import { env } from '../config/env.js';

// Return bigint (bigserial) as string and keep numeric as string (exact decimals).
// Timestamps arrive as JS Date objects.
const isRemote = env.DATABASE_URL && !env.DATABASE_URL.includes('localhost') && !env.DATABASE_URL.includes('127.0.0.1');

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  ...(isRemote && {
    ssl: { rejectUnauthorized: false },
  }),
});

export const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction. Rolls back on any throw. */
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
