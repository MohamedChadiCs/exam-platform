import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { query, withTx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../utils/AppError.js';
import { requireAuth, requireRole } from '../middleware/security.js';

export const academicRouter = Router();

function generateClassInviteCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(6);
  let code = 'CLS-';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

const adminOnly = [requireAuth, requireRole('ADMIN')];
const professorOrAdmin = [requireAuth, requireRole('PROFESSOR', 'ADMIN')];
const studentOnly = [requireAuth, requireRole('STUDENT')];

// ==========================================
// Departments (Admin Only)
// ==========================================

academicRouter.get('/departments', async (_req, res) => {
  const { rows } = await query('SELECT id, code, name FROM departments WHERE archived_at IS NULL ORDER BY name');
  res.json({ success: true, data: rows });
});

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

// ==========================================
// Classes (Admin & Professor CRUD + Students)
// ==========================================

academicRouter.get('/classes', async (req, res) => {
  const { departmentId, mine } = z.object({
    departmentId: z.string().uuid().optional(),
    mine: z.enum(['true', 'false']).optional(),
  }).parse(req.query);

  const ownerFilter = (mine === 'true' && req.auth?.user?.id) ? req.auth.user.id : null;

  const { rows } = await query(
    `SELECT ac.id, ac.department_id, ac.name, ac.academic_year, ac.teacher_id, ac.teacher_id AS owner_id,
            ac.invite_code, ac.created_at,
            d.name AS department_name,
            u.first_name || ' ' || u.last_name AS owner_name,
            u.first_name || ' ' || u.last_name AS teacher_name,
            (SELECT count(*)::int FROM class_students WHERE class_id = ac.id) AS student_count,
            (SELECT count(*)::int FROM class_courses WHERE class_id = ac.id) AS course_count
       FROM academic_classes ac
       LEFT JOIN departments d ON d.id = ac.department_id
       LEFT JOIN users u ON u.id = ac.teacher_id
      WHERE ac.archived_at IS NULL
        AND ($1::uuid IS NULL OR ac.department_id = $1)
        AND ($2::uuid IS NULL OR ac.teacher_id = $2)
      ORDER BY ac.academic_year DESC, ac.name`,
    [departmentId ?? null, ownerFilter]
  );
  res.json({ success: true, data: rows });
});

academicRouter.get('/classes/:id', requireAuth, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  const { rows: classRows } = await query(
    `SELECT ac.id, ac.department_id, ac.name, ac.academic_year, ac.teacher_id, ac.teacher_id AS owner_id,
            ac.invite_code, ac.created_at,
            d.name AS department_name,
            u.first_name || ' ' || u.last_name AS owner_name,
            u.first_name || ' ' || u.last_name AS teacher_name
       FROM academic_classes ac
       LEFT JOIN departments d ON d.id = ac.department_id
       LEFT JOIN users u ON u.id = ac.teacher_id
      WHERE ac.id = $1 AND ac.archived_at IS NULL`,
    [id]
  );
  if (!classRows[0]) throw AppError.notFound('Class not found');
  const cls = classRows[0];

  // Fetch enrolled students
  const { rows: students } = await query(
    `SELECT s.user_id, s.matricule, u.first_name, u.last_name, u.email, cs.enrolled_at
       FROM class_students cs
       JOIN students s ON s.user_id = cs.student_id
       JOIN users u ON u.id = s.user_id
      WHERE cs.class_id = $1
      ORDER BY cs.enrolled_at DESC, u.last_name, u.first_name`,
    [id]
  );

  // Fetch assigned courses
  const { rows: courses } = await query(
    `SELECT c.id, c.code, c.name, d.name AS department_name, cc.assigned_at
       FROM class_courses cc
       JOIN courses c ON c.id = cc.course_id
       LEFT JOIN departments d ON d.id = c.department_id
      WHERE cc.class_id = $1 AND c.archived_at IS NULL
      ORDER BY c.code, c.name`,
    [id]
  );

  res.json({ success: true, data: { ...cls, students, courses } });
});

academicRouter.post('/classes', ...professorOrAdmin, async (req, res) => {
  const body = z.object({
    departmentId: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1).max(50),
    academicYear: z.string().trim().min(4).max(20),
  }).parse(req.body);

  let deptId = body.departmentId || null;
  if (!deptId && req.auth.user.role === 'PROFESSOR') {
    const { rows: pRows } = await query('SELECT department_id FROM professors WHERE user_id = $1', [req.auth.user.id]);
    deptId = pRows[0]?.department_id || null;
  }

  const ownerId = req.auth.user.role === 'PROFESSOR' ? req.auth.user.id : null;
  const inviteCode = generateClassInviteCode();

  let rows;
  if (deptId) {
    const res = await query(
      `INSERT INTO academic_classes (department_id, name, academic_year, teacher_id, invite_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (department_id, name, academic_year) DO UPDATE
         SET archived_at = NULL,
             invite_code = COALESCE(academic_classes.invite_code, EXCLUDED.invite_code),
             teacher_id = COALESCE(academic_classes.teacher_id, EXCLUDED.teacher_id)
       RETURNING id, department_id, name, academic_year, teacher_id, teacher_id AS owner_id, invite_code, created_at`,
      [deptId, body.name, body.academicYear, ownerId, inviteCode]
    );
    rows = res.rows;
  } else {
    const res = await query(
      `INSERT INTO academic_classes (department_id, name, academic_year, teacher_id, invite_code)
       VALUES (NULL, $1, $2, $3, $4)
       RETURNING id, department_id, name, academic_year, teacher_id, teacher_id AS owner_id, invite_code, created_at`,
      [body.name, body.academicYear, ownerId, inviteCode]
    );
    rows = res.rows;
  }

  await audit({ actorId: req.auth.user.id, action: 'CLASS_CREATED', entityType: 'academic_class', entityId: rows[0].id, after: rows[0], ip: req.ip });
  res.status(201).json({ success: true, data: rows[0] });
});

academicRouter.put('/classes/:id', ...professorOrAdmin, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    name: z.string().trim().min(1).max(50),
    academicYear: z.string().trim().min(4).max(20),
    departmentId: z.string().uuid().optional().nullable(),
  }).parse(req.body);

  const { rows } = await query(
    `UPDATE academic_classes
        SET name = $2, academic_year = $3, department_id = COALESCE($4, department_id)
      WHERE id = $1 AND ($5 = 'ADMIN' OR teacher_id = $6) AND archived_at IS NULL
      RETURNING id, department_id, name, academic_year, teacher_id, teacher_id AS owner_id, invite_code`,
    [id, body.name, body.academicYear, body.departmentId ?? null, req.auth.user.role, req.auth.user.id]
  );
  if (!rows[0]) throw AppError.notFound('Class not found or unauthorized');
  await audit({ actorId: req.auth.user.id, action: 'CLASS_UPDATED', entityType: 'academic_class', entityId: id, after: rows[0], ip: req.ip });
  res.json({ success: true, data: rows[0] });
});

academicRouter.delete('/classes/:id', ...professorOrAdmin, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rowCount } = await query(
    `UPDATE academic_classes SET archived_at = now()
      WHERE id = $1 AND ($2 = 'ADMIN' OR teacher_id = $3) AND archived_at IS NULL`,
    [id, req.auth.user.role, req.auth.user.id]
  );
  if (!rowCount) throw AppError.notFound('Class not found or unauthorized');
  await audit({ actorId: req.auth.user.id, action: 'CLASS_ARCHIVED', entityType: 'academic_class', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, archived: true } });
});

// Invite / Add Student to Class (by Email or Matricule)
academicRouter.post('/classes/:id/invite', ...professorOrAdmin, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { identifier } = z.object({ identifier: z.string().trim().min(1) }).parse(req.body);

  // Check class exists and owned by professor or admin
  const { rows: clsRows } = await query(
    `SELECT id, name FROM academic_classes WHERE id = $1 AND archived_at IS NULL AND ($2 = 'ADMIN' OR teacher_id = $3)`,
    [id, req.auth.user.role, req.auth.user.id]
  );
  if (!clsRows[0]) throw AppError.notFound('Class not found or unauthorized');

  // Find student
  const { rows: sRows } = await query(
    `SELECT s.user_id, s.matricule, u.first_name, u.last_name, u.email
       FROM users u
       JOIN students s ON s.user_id = u.id
      WHERE (LOWER(u.email) = LOWER($1) OR UPPER(s.matricule) = UPPER($1))
        AND u.status = 'ACTIVE'`,
    [identifier]
  );
  if (!sRows[0]) throw AppError.notFound('No active student found with this email or student ID (matricule)');
  const student = sRows[0];

  await query(
    `INSERT INTO class_students (class_id, student_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [id, student.user_id]
  );

  await audit({
    actorId: req.auth.user.id,
    action: 'STUDENT_ENROLLED_IN_CLASS',
    entityType: 'academic_class',
    entityId: id,
    after: { studentId: student.user_id, classId: id },
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: student });
});

// Remove Student from Class
academicRouter.delete('/classes/:id/students/:studentId', ...professorOrAdmin, async (req, res) => {
  const { id, studentId } = z.object({
    id: z.string().uuid(),
    studentId: z.string().uuid(),
  }).parse(req.params);

  // Check authorization
  const { rows: clsRows } = await query(
    `SELECT id FROM academic_classes WHERE id = $1 AND archived_at IS NULL AND ($2 = 'ADMIN' OR teacher_id = $3)`,
    [id, req.auth.user.role, req.auth.user.id]
  );
  if (!clsRows[0]) throw AppError.notFound('Class not found or unauthorized');

  const { rowCount } = await query(
    `DELETE FROM class_students WHERE class_id = $1 AND student_id = $2`,
    [id, studentId]
  );
  if (!rowCount) throw AppError.notFound('Student is not enrolled in this class');

  await audit({
    actorId: req.auth.user.id,
    action: 'STUDENT_REMOVED_FROM_CLASS',
    entityType: 'academic_class',
    entityId: id,
    after: { studentId, classId: id },
    ip: req.ip,
  });

  res.json({ success: true, data: { studentId, removed: true } });
});

// Assign Course to Class
academicRouter.post('/classes/:id/courses', ...professorOrAdmin, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { courseId } = z.object({ courseId: z.string().uuid() }).parse(req.body);

  const { rows: clsRows } = await query(
    `SELECT id FROM academic_classes WHERE id = $1 AND archived_at IS NULL AND ($2 = 'ADMIN' OR teacher_id = $3)`,
    [id, req.auth.user.role, req.auth.user.id]
  );
  if (!clsRows[0]) throw AppError.notFound('Class not found or unauthorized');

  await query(
    `INSERT INTO class_courses (class_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, courseId]
  );

  res.status(201).json({ success: true, data: { classId: id, courseId } });
});

// Unassign Course from Class
academicRouter.delete('/classes/:id/courses/:courseId', ...professorOrAdmin, async (req, res) => {
  const { id, courseId } = z.object({
    id: z.string().uuid(),
    courseId: z.string().uuid(),
  }).parse(req.params);

  const { rows: clsRows } = await query(
    `SELECT id FROM academic_classes WHERE id = $1 AND archived_at IS NULL AND ($2 = 'ADMIN' OR teacher_id = $3)`,
    [id, req.auth.user.role, req.auth.user.id]
  );
  if (!clsRows[0]) throw AppError.notFound('Class not found or unauthorized');

  await query(
    `DELETE FROM class_courses WHERE class_id = $1 AND course_id = $2`,
    [id, courseId]
  );

  res.json({ success: true, data: { classId: id, courseId, removed: true } });
});

// Student Joins Class using Invite Code
academicRouter.post('/classes/join', ...studentOnly, async (req, res) => {
  const { inviteCode } = z.object({
    inviteCode: z.string().trim().min(1).max(20),
  }).parse(req.body);

  const { rows: clsRows } = await query(
    `SELECT id, name, academic_year, teacher_id, teacher_id AS owner_id FROM academic_classes
      WHERE UPPER(invite_code) = UPPER($1) AND archived_at IS NULL`,
    [inviteCode]
  );
  if (!clsRows[0]) throw AppError.notFound('Invalid class invite code');
  const cls = clsRows[0];

  await query(
    `INSERT INTO class_students (class_id, student_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [cls.id, req.auth.user.id]
  );

  await audit({
    actorId: req.auth.user.id,
    action: 'STUDENT_JOINED_CLASS',
    entityType: 'academic_class',
    entityId: cls.id,
    after: { classId: cls.id },
    ip: req.ip,
  });

  res.json({ success: true, data: cls });
});

// Student view of their enrolled classes
academicRouter.get('/student/classes', ...studentOnly, async (req, res) => {
  const { rows } = await query(
    `SELECT ac.id, ac.name, ac.academic_year, d.name AS department_name,
            u.first_name || ' ' || u.last_name AS professor_name,
            cs.enrolled_at,
            (SELECT count(*)::int FROM class_courses WHERE class_id = ac.id) AS course_count,
            COALESCE(
              (SELECT json_agg(json_build_object('id', c.id, 'code', c.code, 'name', c.name))
                 FROM class_courses cc
                 JOIN courses c ON c.id = cc.course_id
                WHERE cc.class_id = ac.id AND c.archived_at IS NULL),
              '[]'::json
            ) AS courses
       FROM class_students cs
       JOIN academic_classes ac ON ac.id = cs.class_id
       LEFT JOIN departments d ON d.id = ac.department_id
       LEFT JOIN users u ON u.id = ac.teacher_id
      WHERE cs.student_id = $1 AND ac.archived_at IS NULL
      ORDER BY cs.enrolled_at DESC`,
    [req.auth.user.id]
  );
  res.json({ success: true, data: rows });
});

// ==========================================
// Courses (Admin & Professor CRUD + Assign to Classes)
// ==========================================

academicRouter.get('/courses', async (req, res) => {
  const { departmentId, mine } = z.object({
    departmentId: z.string().uuid().optional(),
    mine: z.enum(['true', 'false']).optional(),
  }).parse(req.query);

  const ownerFilter = (mine === 'true' && req.auth?.user?.id) ? req.auth.user.id : null;

  const { rows } = await query(
    `SELECT c.id, c.department_id, c.code, c.name, c.teacher_id, c.teacher_id AS owner_id, d.name AS department_name,
            u.first_name || ' ' || u.last_name AS professor_name,
            COALESCE(
              (SELECT json_agg(json_build_object('id', ac.id, 'name', ac.name, 'academic_year', ac.academic_year))
                 FROM class_courses cc
                 JOIN academic_classes ac ON ac.id = cc.class_id
                WHERE cc.course_id = c.id AND ac.archived_at IS NULL),
              '[]'::json
            ) AS assigned_classes
       FROM courses c
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN users u ON u.id = c.teacher_id
      WHERE c.archived_at IS NULL
        AND ($1::uuid IS NULL OR c.department_id = $1)
        AND ($2::uuid IS NULL OR c.teacher_id = $2 OR EXISTS (SELECT 1 FROM course_professors WHERE course_id = c.id AND professor_id = $2))
      ORDER BY c.code, c.name`,
    [departmentId ?? null, ownerFilter]
  );
  res.json({ success: true, data: rows });
});

academicRouter.post('/courses', ...professorOrAdmin, async (req, res) => {
  const body = z.object({
    departmentId: z.string().uuid().optional().nullable(),
    code: z.string().trim().min(1).max(20).toUpperCase(),
    name: z.string().trim().min(1).max(100),
    classIds: z.array(z.string().uuid()).optional(),
  }).parse(req.body);

  let deptId = body.departmentId || null;
  if (!deptId && req.auth.user.role === 'PROFESSOR') {
    const { rows: pRows } = await query('SELECT department_id FROM professors WHERE user_id = $1', [req.auth.user.id]);
    deptId = pRows[0]?.department_id || null;
  }

  const ownerId = req.auth.user.role === 'PROFESSOR' ? req.auth.user.id : null;

  const result = await withTx(async (db) => {
    let courseRow;
    if (deptId) {
      const { rows } = await db.query(
        `INSERT INTO courses (department_id, code, name, teacher_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (department_id, code) DO UPDATE SET name = EXCLUDED.name, archived_at = NULL
         RETURNING id, department_id, code, name, teacher_id, teacher_id AS owner_id`,
        [deptId, body.code, body.name, ownerId]
      );
      courseRow = rows[0];
    } else {
      const { rows } = await db.query(
        `INSERT INTO courses (code, name, teacher_id)
         VALUES ($1, $2, $3)
         RETURNING id, department_id, code, name, teacher_id, teacher_id AS owner_id`,
        [body.code, body.name, ownerId]
      );
      courseRow = rows[0];
    }

    // Link course to professor
    if (req.auth.user.role === 'PROFESSOR') {
      await db.query(
        `INSERT INTO course_professors (course_id, professor_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [courseRow.id, req.auth.user.id]
      );
    }

    // Assign to classes if requested
    if (body.classIds && body.classIds.length > 0) {
      for (const classId of body.classIds) {
        await db.query(
          `INSERT INTO class_courses (class_id, course_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [classId, courseRow.id]
        );
      }
    }

    await audit({
      actorId: req.auth.user.id,
      action: 'COURSE_CREATED',
      entityType: 'course',
      entityId: courseRow.id,
      after: { ...courseRow, classIds: body.classIds },
      ip: req.ip,
    }, db);

    return courseRow;
  });

  res.status(201).json({ success: true, data: result });
});

academicRouter.put('/courses/:id', ...professorOrAdmin, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    code: z.string().trim().min(1).max(20).toUpperCase(),
    name: z.string().trim().min(1).max(100),
    departmentId: z.string().uuid().optional().nullable(),
    classIds: z.array(z.string().uuid()).optional(),
  }).parse(req.body);

  const result = await withTx(async (db) => {
    const { rows } = await db.query(
      `UPDATE courses
          SET code = $2, name = $3, department_id = COALESCE($4, department_id)
        WHERE id = $1 AND ($5 = 'ADMIN' OR teacher_id = $6 OR EXISTS (SELECT 1 FROM course_professors WHERE course_id = $1 AND professor_id = $6))
        RETURNING id, department_id, code, name, teacher_id, teacher_id AS owner_id`,
      [id, body.code, body.name, body.departmentId ?? null, req.auth.user.role, req.auth.user.id]
    );
    if (!rows[0]) throw AppError.notFound('Course not found or unauthorized');

    // Sync classes if provided
    if (body.classIds !== undefined) {
      await db.query(`DELETE FROM class_courses WHERE course_id = $1`, [id]);
      for (const classId of body.classIds) {
        await db.query(`INSERT INTO class_courses (class_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [classId, id]);
      }
    }

    await audit({ actorId: req.auth.user.id, action: 'COURSE_UPDATED', entityType: 'course', entityId: id, after: rows[0], ip: req.ip }, db);
    return rows[0];
  });

  res.json({ success: true, data: result });
});

academicRouter.delete('/courses/:id', ...professorOrAdmin, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rowCount } = await query(
    `UPDATE courses SET archived_at = now()
      WHERE id = $1 AND ($2 = 'ADMIN' OR teacher_id = $3 OR EXISTS (SELECT 1 FROM course_professors WHERE course_id = $1 AND professor_id = $3))`,
    [id, req.auth.user.role, req.auth.user.id]
  );
  if (!rowCount) throw AppError.notFound('Course not found or unauthorized');
  await audit({ actorId: req.auth.user.id, action: 'COURSE_ARCHIVED', entityType: 'course', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, archived: true } });
});
