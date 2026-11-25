import { query } from '../lib/db.js';
import { randomToken, sha256 } from '../lib/crypto.js';

export const SESSION_COOKIE = 'sid';
export const ABSOLUTE_HOURS = 12;
export const IDLE_MINUTES = 120;

export async function createSession(userId, req) {
  const token = randomToken(32);
  await query(
    `INSERT INTO auth_sessions(id_hash,user_id,expires_at,ip,user_agent)
     VALUES ($1,$2, now() + make_interval(hours => $3), $4, $5)`,
    [sha256(token), userId, ABSOLUTE_HOURS, req.ip, (req.get('user-agent') || '').slice(0, 300)]);
  return token;
}

export const revokeSession = (token) =>
  query('UPDATE auth_sessions SET revoked_at = now() WHERE id_hash = $1 AND revoked_at IS NULL', [sha256(token)]);

export const revokeAllForUser = (userId, db = { query }) =>
  db.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);

/** Returns { idHash, user } or null. Enforces absolute expiry, idle timeout and account status in SQL. */
export async function loadSession(token) {
  const idHash = sha256(token);
  const { rows } = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.locale, u.status, r.code AS role,
            COALESCE(p.verified_at, st.verified_at) AS verified_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN professors p ON p.user_id = u.id
       LEFT JOIN students st ON st.user_id = u.id
      WHERE s.id_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(mins => $2)
        AND u.status = 'ACTIVE'`,
    [idHash, IDLE_MINUTES]);
  if (!rows[0]) return null;
  // throttle writes: touch at most once a minute
  await query(
    `UPDATE auth_sessions SET last_seen_at = now()
      WHERE id_hash = $1 AND last_seen_at < now() - interval '1 minute'`, [idHash]);
  return { idHash, user: rows[0] };
}
