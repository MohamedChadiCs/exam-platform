import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../utils/AppError.js';
import { requireAuth, requireRole } from '../middleware/security.js';

export const academicRouter = Router();

// ==========================================
// Public read endpoints (used in registration & dropdowns)
// ==========================================

academicRouter.get('/departments', async (_req, res) => {
  const { rows } = await query('SELECT id, code, name FROM departments WHERE archived_at IS NULL ORDER BY name');
  res.json({ success: true, data: rows });
});

academicRouter.get('/classes', async (req, res) => {
  const { departmentId } = z.object({ departmentId: z.string().uuid().optional() }).parse(req.query);
  const { rows } = await query(
    `SELECT id, department_id, name, academic_year FROM academic_classes
      WHERE archived_at IS NULL AND ($1::uuid IS NULL OR department_id=$1) ORDER BY academic_year DESC, name`,
    [departmentId ?? null]);
  res.json({ success: true, data: rows });
});

academicRouter.get('/courses', async (req, res) => {
  const { departmentId } = z.object({ departmentId: z.string().uuid().optional() }).parse(req.query);
  const { rows } = await query(
    `SELECT c.id, c.department_id, c.code, c.name, d.name AS department_name
       FROM courses c
       JOIN departments d ON d.id = c.department_id
      WHERE c.archived_at IS NULL AND ($1::uuid IS NULL OR c.department_id=$1)
      ORDER BY c.code, c.name`,
    [departmentId ?? null]);
  res.json({ success: true, data: rows });
});

// ==========================================
// Admin CRUD Endpoints
// ==========================================

const adminOnly = [requireAuth, requireRole('ADMIN')];

// Departments
academicRouter.post('/departments', ...adminOnly, async (req, res) => {
  const body = z.object({
    code: z.string().trim().min(1).max(20).toUpperCase(),
    name: z.string().trim().min(1).max(100),
  }).parse(req.body);

  const { rows } = await query(
    `INSERT INTO departments (code, name) VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, archived_at = NULL
     RETURNING id, code, name`,
    [body.code, body.name]
  );
  await audit({ actorId: req.auth.user.id, action: 'DEPARTMENT_CREATED', entityType: 'department', entityId: rows[0].id, after: rows[0], ip: req.ip });
  res.status(201).json({ success: true, data: rows[0] });
});

academicRouter.put('/departments/:id', ...adminOnly, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    code: z.string().trim().min(1).max(20).toUpperCase(),
    name: z.string().trim().min(1).max(100),
  }).parse(req.body);

  const { rows } = await query(
    `UPDATE departments SET code = $2, name = $3 WHERE id = $1 RETURNING id, code, name`,
    [id, body.code, body.name]
  );
  if (!rows[0]) throw AppError.notFound('Department not found');
  await audit({ actorId: req.auth.user.id, action: 'DEPARTMENT_UPDATED', entityType: 'department', entityId: id, after: rows[0], ip: req.ip });
  res.json({ success: true, data: rows[0] });
});

academicRouter.delete('/departments/:id', ...adminOnly, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rowCount } = await query('UPDATE departments SET archived_at = now() WHERE id = $1', [id]);
  if (!rowCount) throw AppError.notFound('Department not found');
  await audit({ actorId: req.auth.user.id, action: 'DEPARTMENT_ARCHIVED', entityType: 'department', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, archived: true } });
});

// Classes
academicRouter.post('/classes', ...adminOnly, async (req, res) => {
  const body = z.object({
    departmentId: z.string().uuid(),
    name: z.string().trim().min(1).max(50),
    academicYear: z.string().trim().min(4).max(20),
  }).parse(req.body);

  const { rows } = await query(
    `INSERT INTO academic_classes (department_id, name, academic_year)
     VALUES ($1, $2, $3)
     ON CONFLICT (department_id, name, academic_year) DO UPDATE SET archived_at = NULL
     RETURNING id, department_id, name, academic_year`,
    [body.departmentId, body.name, body.academicYear]
  );
  await audit({ actorId: req.auth.user.id, action: 'CLASS_CREATED', entityType: 'academic_class', entityId: rows[0].id, after: rows[0], ip: req.ip });
  res.status(201).json({ success: true, data: rows[0] });
});

academicRouter.put('/classes/:id', ...adminOnly, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    name: z.string().trim().min(1).max(50),
    academicYear: z.string().trim().min(4).max(20),
  }).parse(req.body);

  const { rows } = await query(
    `UPDATE academic_classes SET name = $2, academic_year = $3 WHERE id = $1 RETURNING id, department_id, name, academic_year`,
    [id, body.name, body.academicYear]
  );
  if (!rows[0]) throw AppError.notFound('Class not found');
  await audit({ actorId: req.auth.user.id, action: 'CLASS_UPDATED', entityType: 'academic_class', entityId: id, after: rows[0], ip: req.ip });
  res.json({ success: true, data: rows[0] });
});

academicRouter.delete('/classes/:id', ...adminOnly, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rowCount } = await query('UPDATE academic_classes SET archived_at = now() WHERE id = $1', [id]);
  if (!rowCount) throw AppError.notFound('Class not found');
  await audit({ actorId: req.auth.user.id, action: 'CLASS_ARCHIVED', entityType: 'academic_class', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, archived: true } });
});

// Courses
academicRouter.post('/courses', ...adminOnly, async (req, res) => {
  const body = z.object({
    departmentId: z.string().uuid(),
    code: z.string().trim().min(1).max(20).toUpperCase(),
    name: z.string().trim().min(1).max(100),
  }).parse(req.body);

  const { rows } = await query(
    `INSERT INTO courses (department_id, code, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (department_id, code) DO UPDATE SET name = EXCLUDED.name, archived_at = NULL
     RETURNING id, department_id, code, name`,
    [body.departmentId, body.code, body.name]
  );
  await audit({ actorId: req.auth.user.id, action: 'COURSE_CREATED', entityType: 'course', entityId: rows[0].id, after: rows[0], ip: req.ip });
  res.status(201).json({ success: true, data: rows[0] });
});

academicRouter.put('/courses/:id', ...adminOnly, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    code: z.string().trim().min(1).max(20).toUpperCase(),
    name: z.string().trim().min(1).max(100),
  }).parse(req.body);

  const { rows } = await query(
    `UPDATE courses SET code = $2, name = $3 WHERE id = $1 RETURNING id, department_id, code, name`,
    [id, body.code, body.name]
  );
  if (!rows[0]) throw AppError.notFound('Course not found');
  await audit({ actorId: req.auth.user.id, action: 'COURSE_UPDATED', entityType: 'course', entityId: id, after: rows[0], ip: req.ip });
  res.json({ success: true, data: rows[0] });
});

academicRouter.delete('/courses/:id', ...adminOnly, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rowCount } = await query('UPDATE courses SET archived_at = now() WHERE id = $1', [id]);
  if (!rowCount) throw AppError.notFound('Course not found');
  await audit({ actorId: req.auth.user.id, action: 'COURSE_ARCHIVED', entityType: 'course', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, archived: true } });
});
