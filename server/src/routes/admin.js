import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../utils/AppError.js';
import { revokeAllForUser } from '../services/sessions.js';
import { requireAuth, requireRole } from '../middleware/security.js';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  role: z.enum(['ADMIN', 'PROFESSOR', 'STUDENT']).optional(),
  status: z.enum(['PENDING_EMAIL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const suspendSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  until: z.coerce.date().refine((d) => d > new Date(), 'must be in the future').optional(),
}).strict();

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/users', async (req, res) => {
  const f = listQuery.parse(req.query);
  const { rows } = await query(
    `SELECT u.id,u.email,u.first_name,u.last_name,r.code AS role,u.status,u.created_at,u.last_login_at,
            u.suspension_reason,u.suspended_until,COALESCE(p.verified_at, st.verified_at) AS verified_at
       FROM users u
       JOIN roles r ON r.id=u.role_id
       LEFT JOIN professors p ON p.user_id=u.id
       LEFT JOIN students st ON st.user_id=u.id
      WHERE ($1::text IS NULL OR r.code=$1) AND ($2::text IS NULL OR u.status=$2)
        AND ($3::text IS NULL OR u.email ILIKE '%'||$3||'%' OR u.last_name ILIKE '%'||$3||'%')
      ORDER BY u.created_at DESC LIMIT $4 OFFSET $5`,
    [f.role ?? null, f.status ?? null, f.q ?? null, f.limit, f.offset]);
  res.json({ success: true, data: rows });
});

async function changeStatus(req, res, { from, to, action, patch }) {
  const { id } = idParam.parse(req.params);
  if (id === req.auth.user.id) throw AppError.badRequest('You cannot do this to your own account');
  const result = await withTx(async (db) => {
    const { rows } = await db.query(
      `SELECT u.id, u.status, r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE`, [id]);
    const u = rows[0];
    if (!u) throw AppError.notFound('User not found');
    if (u.role === 'ADMIN') throw AppError.forbidden('Administrator accounts cannot be changed here');
    if (!from.includes(u.status)) throw AppError.conflict(`Cannot apply from status ${u.status}`);
    await db.query(
      `UPDATE users SET status=$2, suspended_at=$3, suspended_by=$4, suspension_reason=$5,
                        suspended_until=$6, updated_at=now() WHERE id=$1`,
      [id, to, patch.suspended_at, patch.suspended_by, patch.reason, patch.until]);
    if (to !== 'ACTIVE') await revokeAllForUser(id, db); // ban/archive takes effect immediately
    await audit({ actorId: req.auth.user.id, action, entityType: 'user', entityId: id,
      before: { status: u.status }, after: { status: to, reason: patch.reason, until: patch.until }, ip: req.ip }, db);
    return { id, status: to };
  });
  res.json({ success: true, data: result });
}

adminRouter.post('/users/:id/suspend', (req, res) => {
  const b = suspendSchema.parse(req.body);
  return changeStatus(req, res, {
    from: ['ACTIVE', 'PENDING_EMAIL'], to: 'SUSPENDED', action: 'USER_SUSPENDED',
    patch: { suspended_at: new Date(), suspended_by: req.auth.user.id, reason: b.reason, until: b.until ?? null },
  });
});
adminRouter.post('/users/:id/unsuspend', (req, res) =>
  changeStatus(req, res, {
    from: ['SUSPENDED'], to: 'ACTIVE', action: 'USER_UNSUSPENDED',
    patch: { suspended_at: null, suspended_by: null, reason: null, until: null },
  }));
adminRouter.post('/users/:id/archive', (req, res) =>
  changeStatus(req, res, {
    from: ['ACTIVE', 'SUSPENDED', 'PENDING_EMAIL'], to: 'ARCHIVED', action: 'USER_ARCHIVED',
    patch: { suspended_at: null, suspended_by: null, reason: null, until: null },
  }));

adminRouter.post('/professors/:id/verify', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rowCount } = await query(
    'UPDATE professors SET verified_at=now(), verified_by=$2 WHERE user_id=$1', [id, req.auth.user.id]);
  if (!rowCount) throw AppError.notFound('Professor not found');
  await audit({ actorId: req.auth.user.id, action: 'PROFESSOR_VERIFIED', entityType: 'user', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, verified: true } });
});

adminRouter.post('/students/:id/approve', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rowCount } = await query(
    'UPDATE students SET verified_at=now(), verified_by=$2 WHERE user_id=$1', [id, req.auth.user.id]);
  if (!rowCount) throw AppError.notFound('Student not found');
  await audit({ actorId: req.auth.user.id, action: 'STUDENT_APPROVED', entityType: 'user', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, approved: true } });
});

adminRouter.post('/students/:id/revoke', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { rowCount } = await query(
    'UPDATE students SET verified_at=NULL, verified_by=NULL WHERE user_id=$1', [id]);
  if (!rowCount) throw AppError.notFound('Student not found');
  await audit({ actorId: req.auth.user.id, action: 'STUDENT_REVOKED', entityType: 'user', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, approved: false } });
});

adminRouter.get('/audit-logs', async (req, res) => {
  const { limit, offset } = listQuery.pick({ limit: true, offset: true }).parse(req.query);
  const { rows } = await query(
    `SELECT id,actor_id,action,entity_type,entity_id,before,after,ip,created_at
       FROM activity_logs ORDER BY id DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  res.json({ success: true, data: rows });
});
