import argon2 from 'argon2';
import { query, withTx } from '../src/lib/db.js';

const hashPassword = async (p) =>
  argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

const { rows: depts } = await query(`SELECT id FROM departments WHERE code = 'CS' LIMIT 1`);
const deptId = depts[0]?.id;

const { rows: classes } = await query(`SELECT id FROM academic_classes WHERE name = 'L3' LIMIT 1`);
const classId = classes[0]?.id;

// 1. Create Teacher / Professor
const teacherEmail = 'teacher@exam.local';
const teacherPass = 'TeacherPassword123!';
const teacherHash = await hashPassword(teacherPass);

await withTx(async (db) => {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, role_id, status, first_name, last_name, locale, email_verified_at)
     VALUES ($1, $2, 2, 'ACTIVE', 'Alan', 'Turing', 'fr', now())
     ON CONFLICT (lower(email))
     DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'ACTIVE', email_verified_at = now()
     RETURNING id`,
    [teacherEmail, teacherHash]
  );
  const teacherId = rows[0].id;
  await db.query(
    `INSERT INTO professors (user_id, department_id, title, verified_at)
     VALUES ($1, $2, 'Dr.', now())
     ON CONFLICT (user_id)
     DO UPDATE SET department_id = EXCLUDED.department_id, verified_at = now()`,
    [teacherId, deptId]
  );
  console.log(`Teacher created/updated: ${teacherEmail}`);
});

// 2. Create Student
const studentEmail = 'student@exam.local';
const studentPass = 'StudentPassword123!';
const studentHash = await hashPassword(studentPass);

await withTx(async (db) => {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, role_id, status, first_name, last_name, locale, email_verified_at)
     VALUES ($1, $2, 3, 'ACTIVE', 'Ada', 'Lovelace', 'fr', now())
     ON CONFLICT (lower(email))
     DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'ACTIVE', email_verified_at = now()
     RETURNING id`,
    [studentEmail, studentHash]
  );
  const studentId = rows[0].id;
  await db.query(
    `INSERT INTO students (user_id, matricule)
     VALUES ($1, 'ST-2026-001')
     ON CONFLICT (user_id)
     DO UPDATE SET matricule = 'ST-2026-001'`,
    [studentId]
  );
  if (classId) {
    await db.query(
      `INSERT INTO class_students (class_id, student_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [classId, studentId]
    );
  }
  console.log(`Student created/updated: ${studentEmail}`);
});

process.exit(0);
