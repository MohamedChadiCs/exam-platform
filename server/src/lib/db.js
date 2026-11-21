import pg from 'pg';
import { env } from '../config/env.js';

// Return bigint (bigserial) as string and keep numeric as string (exact decimals).
// Timestamps arrive as JS Date objects.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 20 });

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
