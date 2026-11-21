import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../utils/AppError.js';
import { requireAuth, requireRole } from '../middleware/security.js';
import { generateAccessCode, hashAccessCode, encryptAccessCode, decryptAccessCode, hashQrToken } from '../lib/codeCrypto.js';
import { randomToken } from '../lib/crypto.js';

export const examsRouter = Router();
examsRouter.use(requireAuth, requireRole('PROFESSOR', 'ADMIN'));

const inlineOptionSchema = z.object({
  bodyMd: z.string().trim().min(1),
  isCorrect: z.boolean().default(false),
  feedbackMd: z.string().trim().optional().nullable(),
});

const inlineQuestionSchema = z.object({
  questionVersionId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  typeCode: z.string().default('MCQ_SINGLE'),
  bodyMd: z.string().trim().min(1),
  explanationMd: z.string().trim().optional().nullable(),
  points: z.coerce.number().min(0).default(1),
  config: z.record(z.any()).default({}),
  options: z.array(inlineOptionSchema).default([]),
});

const examSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  descriptionMd: z.string().trim().optional().nullable(),
  locale: z.enum(['ar', 'fr', 'en']).default('fr'),
  opensAt: z.coerce.date(),
  closesAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive(),
  maxScore: z.coerce.number().positive(),
  passingScore: z.coerce.number().min(0),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  negativeMarking: z.boolean().default(false),
  maxAttempts: z.coerce.number().int().min(1).default(1),
  resultsPolicy: z.enum(['MANUAL', 'AFTER_CLOSE', 'IMMEDIATE']).default('MANUAL'),
  showFeedback: z.boolean().default(false),
  monitorFocus: z.boolean().default(true),
  questions: z.array(inlineQuestionSchema).optional(),
}).refine((d) => d.opensAt < d.closesAt, { message: 'opensAt must be before closesAt', path: ['closesAt'] })
  .refine((d) => d.passingScore <= d.maxScore, { message: 'passingScore cannot exceed maxScore', path: ['passingScore'] });

// Helper to save questions for an exam in a transaction
async function syncExamQuestions(db, examId, professorId, questions) {
  if (!questions || !Array.isArray(questions)) return;

  await db.query(`DELETE FROM exam_questions WHERE exam_id = $1`, [examId]);

  for (let pos = 0; pos < questions.length; pos++) {
    const q = questions[pos];
    let qvId = q.questionVersionId;

    // If new question, insert into questions, question_versions, and answer_options
    if (!qvId) {
      const { rows: qRows } = await db.query(
        `INSERT INTO questions (owner_id, category_id) VALUES ($1, $2) RETURNING id`,
        [professorId, q.categoryId ?? null]
      );
      const questionId = qRows[0].id;

      const { rows: vRows } = await db.query(
        `INSERT INTO question_versions (question_id, version, type_code, locale, body_md, explanation_md, default_points, config)
         VALUES ($1, 1, $2, 'fr', $3, $4, $5, $6)
         RETURNING id`,
        [questionId, q.typeCode, q.bodyMd, q.explanationMd ?? null, q.points, JSON.stringify(q.config ?? {})]
      );
      qvId = vRows[0].id;

      if (q.options && q.options.length > 0) {
        for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
          const opt = q.options[optIdx];
          await db.query(
            `INSERT INTO answer_options (question_version_id, position, body_md, is_correct, feedback_md)
             VALUES ($1, $2, $3, $4, $5)`,
            [qvId, optIdx, opt.bodyMd, opt.isCorrect ?? false, opt.feedbackMd ?? null]
          );
        }
      }
    } else if (q.categoryId !== undefined) {
      await db.query(
        `UPDATE questions SET category_id = $1
          WHERE id = (SELECT question_id FROM question_versions WHERE id = $2)
            AND owner_id = $3`,
        [q.categoryId ?? null, qvId, professorId]
      );
    }

    await db.query(
      `INSERT INTO exam_questions (exam_id, question_version_id, position, points)
       VALUES ($1, $2, $3, $4)`,
      [examId, qvId, pos + 1, q.points]
    );
  }
}

// ==========================================
// Exam CRUD
// ==========================================

examsRouter.get('/', async (req, res) => {
  const { status, courseId, search } = z.object({
    status: z.enum(['ALL', 'DRAFT', 'PUBLISHED', 'CANCELLED', 'CLOSED', 'ARCHIVED']).optional(),
    courseId: z.string().uuid().optional(),
    search: z.string().trim().optional(),
  }).parse(req.query);

  const { rows } = await query(
    `SELECT e.*, c.name AS course_name, c.code AS course_code,
            (SELECT count(*)::int FROM exam_questions WHERE exam_id = e.id) AS question_count,
            (SELECT count(*)::int FROM exam_enrollments WHERE exam_id = e.id AND status = 'ENROLLED') AS enrolled_count,
            (SELECT count(*)::int FROM exam_sessions s JOIN exam_enrollments en ON en.id = s.enrollment_id WHERE en.exam_id = e.id) AS session_count
       FROM exams e
       JOIN courses c ON c.id = e.course_id
      WHERE (e.owner_id = $1 OR $5 = 'ADMIN')
        AND (
          ($2::text = 'ALL') OR
          ($2::text IS NOT NULL AND e.status = $2) OR
          ($2::text IS NULL AND e.status != 'ARCHIVED')
        )
        AND ($3::uuid IS NULL OR e.course_id = $3)
        AND ($4::text IS NULL OR e.title ILIKE '%' || $4 || '%' OR c.name ILIKE '%' || $4 || '%' OR c.code ILIKE '%' || $4 || '%')
      ORDER BY e.created_at DESC`,
    [req.auth.user.id, status ?? null, courseId ?? null, search ?? null, req.auth.user.role]
  );

  res.json({ success: true, data: rows });
});

examsRouter.post('/', async (req, res) => {
  const b = examSchema.parse(req.body);

  const result = await withTx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO exams (course_id, owner_id, title, description_md, locale, opens_at, closes_at,
                          duration_minutes, max_score, passing_score, shuffle_questions, shuffle_options,
                          negative_marking, max_attempts, results_policy, show_feedback, monitor_focus)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        b.courseId, req.auth.user.id, b.title, b.descriptionMd ?? null, b.locale,
        b.opensAt, b.closesAt, b.durationMinutes, b.maxScore, b.passingScore,
        b.shuffleQuestions, b.shuffleOptions, b.negativeMarking, b.maxAttempts,
        b.resultsPolicy, b.showFeedback, b.monitorFocus,
      ]
    );
    const exam = rows[0];

    if (b.questions && b.questions.length > 0) {
      await syncExamQuestions(db, exam.id, req.auth.user.id, b.questions);
    }

    await audit({ actorId: req.auth.user.id, action: 'EXAM_CREATED', entityType: 'exam', entityId: exam.id, after: exam, ip: req.ip }, db);
    return exam;
  });

  res.status(201).json({ success: true, data: result });
});

examsRouter.get('/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  const { rows: examRows } = await query(
    `SELECT e.*, c.name AS course_name, c.code AS course_code
       FROM exams e
       JOIN courses c ON c.id = e.course_id
      WHERE e.id = $1 AND (e.owner_id = $2 OR $3 = 'ADMIN')`,
    [id, req.auth.user.id, req.auth.user.role]
  );
  if (!examRows[0]) throw AppError.notFound('Exam not found');
  const exam = examRows[0];

  // Fetch assigned questions with their versions and options
  const { rows: questions } = await query(
    `SELECT eq.position, eq.points, qv.id AS question_version_id, qv.question_id,
            qv.version, qv.type_code, qv.body_md, qv.explanation_md, qv.config,
            q.category_id, qc.name AS category_name
       FROM exam_questions eq
       JOIN question_versions qv ON qv.id = eq.question_version_id
       JOIN questions q ON q.id = qv.question_id
       LEFT JOIN question_categories qc ON qc.id = q.category_id
      WHERE eq.exam_id = $1
      ORDER BY eq.position`,
    [id]
  );

  const qvIds = questions.map((q) => q.question_version_id);
  let options = [];
  if (qvIds.length > 0) {
    const { rows: optRows } = await query(
      `SELECT id, question_version_id, position, body_md, is_correct, feedback_md
         FROM answer_options WHERE question_version_id = ANY($1::uuid[]) ORDER BY position`,
      [qvIds]
    );
    options = optRows;
  }

  const enrichedQuestions = questions.map((q) => ({
    ...q,
    options: options.filter((o) => o.question_version_id === q.question_version_id),
  }));

  // Fetch access codes
  const { rows: codes } = await query(
    `SELECT ac.id, ac.status, ac.expires_at, ac.max_uses, ac.used_count, ac.code_enc, ac.created_at,
            cl.name AS class_name
       FROM access_codes ac
       LEFT JOIN academic_classes cl ON cl.id = ac.eligible_class_id
      WHERE ac.exam_id = $1
      ORDER BY ac.created_at DESC`,
    [id]
  );

  const decryptedCodes = codes.map((c) => ({
    id: c.id,
    code: decryptAccessCode(c.code_enc),
    status: c.status,
    expiresAt: c.expires_at,
    maxUses: c.max_uses,
    usedCount: c.used_count,
    className: c.class_name,
    createdAt: c.created_at,
  }));

  res.json({ success: true, data: { ...exam, questions: enrichedQuestions, codes: decryptedCodes } });
});

examsRouter.put('/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const b = examSchema.parse(req.body);

  const result = await withTx(async (db) => {
    const { rows } = await db.query(
      `UPDATE exams
          SET course_id = $2, title = $3, description_md = $4, locale = $5, opens_at = $6, closes_at = $7,
              duration_minutes = $8, max_score = $9, passing_score = $10, shuffle_questions = $11,
              shuffle_options = $12, negative_marking = $13, max_attempts = $14, results_policy = $15,
              show_feedback = $16, monitor_focus = $17, updated_at = now()
        WHERE id = $1 AND owner_id = $18 AND status = 'DRAFT'
        RETURNING *`,
      [
        id, b.courseId, b.title, b.descriptionMd ?? null, b.locale,
        b.opensAt, b.closesAt, b.durationMinutes, b.maxScore, b.passingScore,
        b.shuffleQuestions, b.shuffleOptions, b.negativeMarking, b.maxAttempts,
        b.resultsPolicy, b.showFeedback, b.monitorFocus, req.auth.user.id
      ]
    );
    if (!rows[0]) throw AppError.badRequest('Exam not found or cannot be modified (must be DRAFT)');
    const exam = rows[0];

    if (b.questions && Array.isArray(b.questions)) {
      await syncExamQuestions(db, id, req.auth.user.id, b.questions);
    }

    await audit({ actorId: req.auth.user.id, action: 'EXAM_UPDATED', entityType: 'exam', entityId: id, after: exam, ip: req.ip }, db);
    return exam;
  });

  res.json({ success: true, data: result });
});

// Assign questions to exam
examsRouter.post('/:id/questions', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    questions: z.array(z.object({
      questionVersionId: z.string().uuid(),
      position: z.number().int().min(0),
      points: z.coerce.number().min(0),
    })),
  }).parse(req.body);

  await withTx(async (db) => {
    const { rows: examRows } = await db.query(
      `SELECT id, status FROM exams WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [id, req.auth.user.id]
    );
    if (!examRows[0]) throw AppError.notFound('Exam not found');
    if (examRows[0].status !== 'DRAFT') throw AppError.conflict('Cannot change questions of non-draft exam');

    await db.query(`DELETE FROM exam_questions WHERE exam_id = $1`, [id]);

    for (const q of body.questions) {
      await db.query(
        `INSERT INTO exam_questions (exam_id, question_version_id, position, points)
         VALUES ($1, $2, $3, $4)`,
        [id, q.questionVersionId, q.position, q.points]
      );
    }
  });

  res.json({ success: true, data: { examId: id, count: body.questions.length } });
});

// Status change: Publish / Close
examsRouter.post('/:id/publish', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rows } = await query(
    `UPDATE exams SET status = 'PUBLISHED', updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND status = 'DRAFT'
      RETURNING *`,
    [id, req.auth.user.id]
  );
  if (!rows[0]) throw AppError.badRequest('Exam cannot be published (not found or not DRAFT)');
  await audit({ actorId: req.auth.user.id, action: 'EXAM_PUBLISHED', entityType: 'exam', entityId: id, ip: req.ip });
  res.json({ success: true, data: rows[0] });
});

examsRouter.post('/:id/close', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rows } = await query(
    `UPDATE exams SET status = 'CLOSED', updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND status = 'PUBLISHED'
      RETURNING *`,
    [id, req.auth.user.id]
  );
  if (!rows[0]) throw AppError.badRequest('Exam cannot be closed');
  await audit({ actorId: req.auth.user.id, action: 'EXAM_CLOSED', entityType: 'exam', entityId: id, ip: req.ip });
  res.json({ success: true, data: rows[0] });
});

// ==========================================
// Access Codes & QR Generation
// ==========================================

examsRouter.post('/:id/codes', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    expiresAt: z.coerce.date().refine((d) => d > new Date(), 'must be in the future'),
    maxUses: z.number().int().positive().optional().nullable(),
    eligibleClassId: z.string().uuid().optional().nullable(),
  }).parse(req.body);

  const code = generateAccessCode(8);
  const codeHash = hashAccessCode(code);
  const codeEnc = encryptAccessCode(code);
  const qrRaw = randomToken(32);
  const qrHash = hashQrToken(qrRaw);

  const { rows } = await query(
    `INSERT INTO access_codes (exam_id, created_by, code_hash, qr_token_hash, code_enc, expires_at, max_uses, eligible_class_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, status, expires_at, max_uses, used_count, created_at`,
    [id, req.auth.user.id, codeHash, qrHash, codeEnc, body.expiresAt, body.maxUses ?? null, body.eligibleClassId ?? null]
  );

  await audit({ actorId: req.auth.user.id, action: 'ACCESS_CODE_CREATED', entityType: 'access_code', entityId: rows[0].id, ip: req.ip });

  res.status(201).json({
    success: true,
    data: {
      ...rows[0],
      code,
      qrToken: qrRaw,
    },
  });
});

examsRouter.post('/:id/codes/:codeId/revoke', async (req, res) => {
  const { codeId } = z.object({ codeId: z.string().uuid() }).parse(req.params);
  const { rows } = await query(
    `UPDATE access_codes SET status = 'REVOKED', revoked_at = now(), revoked_by = $2
      WHERE id = $1 RETURNING id, status`,
    [codeId, req.auth.user.id]
  );
  if (!rows[0]) throw AppError.notFound('Code not found');
  await audit({ actorId: req.auth.user.id, action: 'ACCESS_CODE_REVOKED', entityType: 'access_code', entityId: codeId, ip: req.ip });
  res.json({ success: true, data: rows[0] });
});

// ==========================================
// Submissions, Manual Grading & Results Publishing
// ==========================================

examsRouter.get('/:id/submissions', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  const { rows } = await query(
    `SELECT s.id AS session_id, s.attempt_no, s.status AS session_status, s.started_at, s.submitted_at,
            u.id AS user_id, u.first_name, u.last_name, u.email, st.matricule,
            sub.total_score, sub.percentage, sub.passed, sub.results_published_at,
            (SELECT count(*)::int FROM security_events WHERE session_id = s.id) AS security_events_count
       FROM exam_sessions s
       JOIN exam_enrollments en ON en.id = s.enrollment_id
       JOIN students st ON st.user_id = en.student_id
       JOIN users u ON u.id = st.user_id
       LEFT JOIN submissions sub ON sub.session_id = s.id
      WHERE en.exam_id = $1
      ORDER BY s.started_at DESC`,
    [id]
  );

  res.json({ success: true, data: rows });
});

examsRouter.get('/:id/submissions/:sessionId', async (req, res) => {
  const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(req.params);

  // 1. Session and submission details
  const { rows: sessionRows } = await query(
    `SELECT s.id AS session_id, s.attempt_no, s.status, s.started_at, s.submitted_at, s.deadline_at,
            u.first_name, u.last_name, u.email, st.matricule,
            sub.total_score, sub.percentage, sub.passed, sub.results_published_at
       FROM exam_sessions s
       JOIN exam_enrollments en ON en.id = s.enrollment_id
       JOIN students st ON st.user_id = en.student_id
       JOIN users u ON u.id = st.user_id
       LEFT JOIN submissions sub ON sub.session_id = s.id
      WHERE s.id = $1`,
    [sessionId]
  );
  if (!sessionRows[0]) throw AppError.notFound('Session not found');

  // 2. Questions, student answers, and grades
  const { rows: questions } = await query(
    `SELECT sq.position, sq.points AS max_points, sq.question_version_id,
            qv.type_code, qv.body_md, qv.explanation_md, qv.config,
            sa.answer AS student_answer, sa.saved_at,
            g.auto_score, g.manual_score, g.final_score, g.needs_manual
       FROM session_questions sq
       JOIN question_versions qv ON qv.id = sq.question_version_id
       LEFT JOIN student_answers sa ON sa.session_id = sq.session_id AND sa.question_version_id = sq.question_version_id
       LEFT JOIN grades g ON g.session_id = sq.session_id AND g.question_version_id = sq.question_version_id
      WHERE sq.session_id = $1
      ORDER BY sq.position`,
    [sessionId]
  );

  // 3. Options for questions
  const qvIds = questions.map((q) => q.question_version_id);
  let options = [];
  if (qvIds.length > 0) {
    const { rows: optRows } = await query(
      `SELECT id, question_version_id, position, body_md, is_correct, feedback_md
         FROM answer_options WHERE question_version_id = ANY($1::uuid[]) ORDER BY position`,
      [qvIds]
    );
    options = optRows;
  }

  // 4. Security events
  const { rows: securityEvents } = await query(
    `SELECT id, event_type, severity, details, client_ts, received_at
       FROM security_events WHERE session_id = $1 ORDER BY received_at`,
    [sessionId]
  );

  const enrichedQuestions = questions.map((q) => ({
    ...q,
    options: options.filter((o) => o.question_version_id === q.question_version_id),
  }));

  res.json({
    success: true,
    data: {
      session: sessionRows[0],
      questions: enrichedQuestions,
      securityEvents,
    },
  });
});

examsRouter.post('/:id/submissions/:sessionId/grade', async (req, res) => {
  const { id, sessionId } = z.object({ id: z.string().uuid(), sessionId: z.string().uuid() }).parse(req.params);
  const body = z.object({
    questionVersionId: z.string().uuid(),
    manualScore: z.coerce.number().min(0),
    comment: z.string().trim().max(1000).optional().nullable(),
  }).parse(req.body);

  const result = await withTx(async (db) => {
    // Fetch previous score
    const { rows: prevGrades } = await db.query(
      `SELECT final_score FROM grades WHERE session_id = $1 AND question_version_id = $2`,
      [sessionId, body.questionVersionId]
    );
    const prevScore = prevGrades[0]?.final_score ?? 0;

    // Update grade
    await db.query(
      `INSERT INTO grades (session_id, question_version_id, manual_score, final_score, needs_manual)
       VALUES ($1, $2, $3, $3, false)
       ON CONFLICT (session_id, question_version_id)
       DO UPDATE SET manual_score = $3, final_score = $3, needs_manual = false`,
      [sessionId, body.questionVersionId, body.manualScore]
    );

    // Record manual correction
    await db.query(
      `INSERT INTO manual_corrections (session_id, question_version_id, grader_id, previous_score, new_score, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, body.questionVersionId, req.auth.user.id, prevScore, body.manualScore, body.comment ?? null]
    );

    // Recalculate total score
    const { rows: sumRows } = await db.query(
      `SELECT coalesce(sum(final_score), 0) AS total_score FROM grades WHERE session_id = $1`,
      [sessionId]
    );
    const newTotal = Number(sumRows[0].total_score);

    const { rows: examRows } = await db.query(`SELECT max_score, passing_score FROM exams WHERE id = $1`, [id]);
    const exam = examRows[0];
    const percentage = exam.max_score > 0 ? Math.round((newTotal / Number(exam.max_score)) * 10000) / 100 : 0;
    const passed = newTotal >= Number(exam.passing_score);

    const { rows: subRows } = await db.query(
      `UPDATE submissions SET total_score = $2, percentage = $3, passed = $4 WHERE session_id = $1 RETURNING *`,
      [sessionId, newTotal, percentage, passed]
    );

    return subRows[0];
  });

  res.json({ success: true, data: result });
});

examsRouter.post('/:id/publish-results', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  const { rowCount } = await query(
    `UPDATE submissions sub
        SET results_published_at = now(), published_by = $2
       FROM exam_sessions s
       JOIN exam_enrollments en ON en.id = s.enrollment_id
      WHERE sub.session_id = s.id AND en.exam_id = $1 AND sub.results_published_at IS NULL`,
    [id, req.auth.user.id]
  );

  await audit({ actorId: req.auth.user.id, action: 'RESULTS_PUBLISHED', entityType: 'exam', entityId: id, ip: req.ip });

  res.json({ success: true, data: { publishedCount: rowCount } });
});
