import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../utils/AppError.js';
import { requireAuth, requireRole } from '../middleware/security.js';
import { hashAccessCode, hashQrToken } from '../lib/codeCrypto.js';
import { gradeSession } from '../services/grading.js';

export const studentRouter = Router();
studentRouter.use(requireAuth, requireRole('STUDENT'));

async function requireApprovedStudent(req, res, next) {
  try {
    const { rows } = await query('SELECT verified_at FROM students WHERE user_id = $1', [req.auth.user.id]);
    if (!rows[0]?.verified_at) {
      throw new AppError(403, 'STUDENT_NOT_APPROVED', 'Your student account is pending administrator approval before you can access examination features.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

studentRouter.get('/approval-status', async (req, res) => {
  const { rows } = await query('SELECT verified_at, verified_by FROM students WHERE user_id = $1', [req.auth.user.id]);
  const isApproved = !!rows[0]?.verified_at;
  res.json({ success: true, data: { isApproved, verifiedAt: rows[0]?.verified_at || null } });
});

// Helper for shuffling arrays
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sanitizeConfigForStudent(typeCode, config) {
  if (!config) return {};
  if (typeCode === 'MATCHING') {
    const pairs = Array.isArray(config.pairs) ? config.pairs : [];
    const leftItems = pairs.map((p, idx) => ({ id: p.id || String(idx), text: p.left }));
    const rightItems = shuffle(pairs.map((p, idx) => ({ id: p.id || String(idx), text: p.right })));
    return { leftItems, rightItems };
  }
  if (typeCode === 'ORDERING') {
    const items = Array.isArray(config.items) ? config.items : [];
    return { items: shuffle(items) };
  }
  if (typeCode === 'FILL_BLANK') {
    const blanks = Array.isArray(config.blanks)
      ? config.blanks.map((b, idx) => ({
          id: b.id || String(idx + 1),
          placeholder: b.placeholder || `Blank ${idx + 1}`,
        }))
      : [];
    return { blanks, template: config.template || null };
  }
  if (typeCode === 'ESSAY' || typeCode === 'LONG_TEXT' || typeCode === 'SHORT_TEXT') {
    return {
      minWords: config.minWords ?? null,
      maxWords: config.maxWords ?? config.wordLimit ?? null,
      wordLimit: config.wordLimit ?? config.maxWords ?? null,
      rubric: config.rubric ?? null,
    };
  }
  if (typeCode === 'CODE') {
    return {
      language: config.language || 'javascript',
      starterCode: config.starterCode || '',
    };
  }
  return {};
}

// ==========================================
// 1. Join Exam via Access Code
// ==========================================

studentRouter.post('/exams/join', requireApprovedStudent, async (req, res) => {
  const body = z.object({
    code: z.string().trim().min(6).max(64),
  }).parse(req.body);

  const studentId = req.auth.user.id;
  const ip = req.ip;

  const result = await withTx(async (db) => {
    // 1. Hash code and check access code
    const codeHash = hashAccessCode(body.code);
    const qrHash = hashQrToken(body.code);

    const { rows: codeRows } = await db.query(
      `SELECT ac.*, e.id AS exam_id, e.title AS exam_title, e.status AS exam_status, e.closes_at
         FROM access_codes ac
         JOIN exams e ON e.id = ac.exam_id
        WHERE (ac.code_hash = $1 OR ac.qr_token_hash = $2)
        FOR UPDATE`,
      [codeHash, qrHash]
    );

    const code = codeRows[0];

    // Helper to log attempt
    const logAttempt = async (outcome) => {
      await db.query(
        `INSERT INTO access_code_attempts (access_code_id, user_id, ip, outcome)
         VALUES ($1, $2, $3, $4)`,
        [code ? code.id : null, studentId, ip, outcome]
      );
    };

    if (!code) {
      await logAttempt('NOT_FOUND');
      throw AppError.notFound('Invalid access code');
    }

    if (code.status === 'REVOKED') {
      await logAttempt('REVOKED');
      throw AppError.badRequest('This access code has been revoked');
    }

    if (code.status === 'EXPIRED' || new Date(code.expires_at) < new Date() || new Date(code.closes_at) < new Date()) {
      await logAttempt('EXPIRED');
      throw AppError.badRequest('This access code or exam has expired');
    }

    if (code.status === 'EXHAUSTED' || (code.max_uses !== null && code.used_count >= code.max_uses)) {
      await logAttempt('EXHAUSTED');
      throw AppError.badRequest('This access code has reached its maximum uses');
    }

    if (code.eligible_class_id) {
      const { rows: enrRows } = await db.query(
        `SELECT 1 FROM class_students WHERE student_id = $1 AND class_id = $2`,
        [studentId, code.eligible_class_id]
      );
      if (!enrRows.length) {
        await logAttempt('INELIGIBLE');
        throw AppError.forbidden('This access code is restricted to a different academic class');
      }
    }

    // Check existing enrollment
    const { rows: existingEnrollment } = await db.query(
      `SELECT id, status FROM exam_enrollments WHERE exam_id = $1 AND student_id = $2`,
      [code.exam_id, studentId]
    );

    if (existingEnrollment[0]?.status === 'ENROLLED') {
      await logAttempt('ALREADY_ENROLLED');
      return {
        examId: code.exam_id,
        examTitle: code.exam_title,
        enrolled: true,
        alreadyEnrolled: true,
      };
    }

    // Increment code use
    const newUsedCount = code.used_count + 1;
    const newStatus = code.max_uses !== null && newUsedCount >= code.max_uses ? 'EXHAUSTED' : 'ACTIVE';
    await db.query(
      `UPDATE access_codes SET used_count = $2, status = $3 WHERE id = $1`,
      [code.id, newUsedCount, newStatus]
    );

    // Enroll student
    await db.query(
      `INSERT INTO exam_enrollments (exam_id, student_id, access_code_id, status)
       VALUES ($1, $2, $3, 'ENROLLED')
       ON CONFLICT (exam_id, student_id)
       DO UPDATE SET status = 'ENROLLED', access_code_id = EXCLUDED.access_code_id`,
      [code.exam_id, studentId, code.id]
    );

    await logAttempt('SUCCESS');
    await audit({ actorId: studentId, action: 'EXAM_ENROLLED', entityType: 'exam', entityId: code.exam_id, ip }, db);

    return {
      examId: code.exam_id,
      examTitle: code.exam_title,
      enrolled: true,
    };
  });

  res.json({ success: true, data: result });
});

// ==========================================
// 2. Enrolled Exams List
// ==========================================

studentRouter.get('/exams', requireApprovedStudent, async (req, res) => {
  const studentId = req.auth.user.id;

  const { rows } = await query(
    `SELECT e.id, e.title, e.description_md, e.opens_at, e.closes_at, e.duration_minutes,
            e.max_score, e.passing_score, e.max_attempts, e.status AS exam_status,
            c.name AS course_name, c.code AS course_code,
            en.status AS enrollment_status,
            (SELECT count(*)::int FROM exam_sessions WHERE enrollment_id = en.id) AS attempts_made,
            (SELECT id FROM exam_sessions WHERE enrollment_id = en.id AND status = 'IN_PROGRESS' LIMIT 1) AS active_session_id,
            (SELECT count(*)::int FROM submissions sub
              JOIN exam_sessions es ON es.id = sub.session_id
             WHERE es.enrollment_id = en.id) AS submitted_count
       FROM exam_enrollments en
       JOIN exams e ON e.id = en.exam_id
       JOIN courses c ON c.id = e.course_id
      WHERE en.student_id = $1 AND en.status = 'ENROLLED' AND e.status != 'ARCHIVED'
      ORDER BY e.opens_at ASC`,
    [studentId]
  );

  res.json({ success: true, data: rows });
});

// ==========================================
// 3. Start Exam Attempt
// ==========================================

studentRouter.post('/exams/:id/start', requireApprovedStudent, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const studentId = req.auth.user.id;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] ?? null;

  const result = await withTx(async (db) => {
    // 1. Validate enrollment and exam status
    const { rows: enrollRows } = await db.query(
      `SELECT en.id AS enrollment_id, e.*
         FROM exam_enrollments en
         JOIN exams e ON e.id = en.exam_id
        WHERE en.exam_id = $1 AND en.student_id = $2 AND en.status = 'ENROLLED'
        FOR UPDATE OF en`,
      [id, studentId]
    );

    const enrollment = enrollRows[0];
    if (!enrollment) throw AppError.forbidden('You are not enrolled in this exam');

    const now = new Date();
    if (enrollment.status !== 'PUBLISHED') {
      throw AppError.badRequest('This exam is not currently available');
    }
    if (now < new Date(enrollment.opens_at)) {
      throw AppError.badRequest('This exam has not opened yet');
    }
    if (now >= new Date(enrollment.closes_at)) {
      throw AppError.badRequest('This exam has closed');
    }

    // 2. Check active in-progress session
    const { rows: activeRows } = await db.query(
      `SELECT id, deadline_at FROM exam_sessions WHERE enrollment_id = $1 AND status = 'IN_PROGRESS'`,
      [enrollment.enrollment_id]
    );
    if (activeRows[0]) {
      const remainingSeconds = Math.max(0, Math.floor((new Date(activeRows[0].deadline_at) - now) / 1000));
      return {
        sessionId: activeRows[0].id,
        deadlineAt: activeRows[0].deadline_at,
        remainingSeconds,
        resumed: true,
      };
    }

    // 3. Check attempt limit
    const { rows: countRows } = await db.query(
      `SELECT count(*)::int AS count FROM exam_sessions WHERE enrollment_id = $1`,
      [enrollment.enrollment_id]
    );
    const attemptNo = countRows[0].count + 1;
    if (attemptNo > enrollment.max_attempts) {
      throw AppError.badRequest(`Maximum attempts reached (${enrollment.max_attempts})`);
    }

    // 4. Calculate deadline
    const durationMs = enrollment.duration_minutes * 60 * 1000;
    const closesAtMs = new Date(enrollment.closes_at).getTime();
    const calculatedDeadlineMs = Math.min(now.getTime() + durationMs, closesAtMs);
    const deadlineAt = new Date(calculatedDeadlineMs);

    // 5. Create session
    const { rows: sessionRows } = await db.query(
      `INSERT INTO exam_sessions (enrollment_id, attempt_no, status, started_at, deadline_at, ip, user_agent)
       VALUES ($1, $2, 'IN_PROGRESS', $3, $4, $5, $6)
       RETURNING id, deadline_at`,
      [enrollment.enrollment_id, attemptNo, now, deadlineAt, ip, userAgent]
    );
    const sessionId = sessionRows[0].id;

    // 6. Select questions
    const { rows: questions } = await db.query(
      `SELECT eq.question_version_id, eq.position, eq.points
         FROM exam_questions eq
        WHERE eq.exam_id = $1
        ORDER BY eq.position`,
      [id]
    );

    const orderedQuestions = enrollment.shuffle_questions ? shuffle(questions) : questions;

    for (let pos = 0; pos < orderedQuestions.length; pos++) {
      const q = orderedQuestions[pos];
      let optionOrder = null;

      if (enrollment.shuffle_options) {
        const { rows: opts } = await db.query(
          `SELECT id FROM answer_options WHERE question_version_id = $1 ORDER BY position`,
          [q.question_version_id]
        );
        if (opts.length > 0) {
          optionOrder = shuffle(opts.map((o) => o.id));
        }
      }

      await db.query(
        `INSERT INTO session_questions (session_id, position, question_version_id, points, option_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, pos + 1, q.question_version_id, q.points, optionOrder]
      );
    }

    await audit({ actorId: studentId, action: 'EXAM_SESSION_STARTED', entityType: 'exam_session', entityId: sessionId, ip }, db);

    const remainingSeconds = Math.max(0, Math.floor((deadlineAt - now) / 1000));
    return {
      sessionId,
      deadlineAt,
      remainingSeconds,
      resumed: false,
    };
  });

  res.status(201).json({ success: true, data: result });
});

// ==========================================
// 4. Active Session Details & Questions
// ==========================================

studentRouter.get('/sessions/:id', requireApprovedStudent, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const studentId = req.auth.user.id;

  const { rows: sessionRows } = await query(
    `SELECT s.id, s.status, s.started_at, s.deadline_at, s.submitted_at,
            e.id AS exam_id, e.title AS exam_title, e.monitor_focus, e.duration_minutes
       FROM exam_sessions s
       JOIN exam_enrollments en ON en.id = s.enrollment_id
       JOIN exams e ON e.id = en.exam_id
      WHERE s.id = $1 AND en.student_id = $2`,
    [id, studentId]
  );

  const session = sessionRows[0];
  if (!session) throw AppError.notFound('Session not found');

  const now = new Date();
  const remainingSeconds = Math.max(0, Math.floor((new Date(session.deadline_at) - now) / 1000));

  // Auto-submit if deadline expired
  if (session.status === 'IN_PROGRESS' && remainingSeconds <= 0) {
    await query(
      `UPDATE exam_sessions SET status = 'AUTO_SUBMITTED', submitted_at = now() WHERE id = $1`,
      [id]
    );
    await gradeSession(id);
    session.status = 'AUTO_SUBMITTED';
  }

  // Fetch session questions
  const { rows: questions } = await query(
    `SELECT sq.position, sq.points, sq.question_version_id, sq.option_order,
            qv.type_code, qv.body_md, qv.locale, qv.config
       FROM session_questions sq
       JOIN question_versions qv ON qv.id = sq.question_version_id
      WHERE sq.session_id = $1
      ORDER BY sq.position`,
    [id]
  );

  // Fetch options for these questions (WITHOUT is_correct or feedback!)
  const qvIds = questions.map((q) => q.question_version_id);
  let options = [];
  if (qvIds.length > 0) {
    const { rows: optRows } = await query(
      `SELECT id, question_version_id, position, body_md
         FROM answer_options WHERE question_version_id = ANY($1::uuid[])`,
      [qvIds]
    );
    options = optRows;
  }

  // Fetch student's saved answers
  const { rows: savedAnswers } = await query(
    `SELECT question_version_id, answer, seq, saved_at FROM student_answers WHERE session_id = $1`,
    [id]
  );
  const answersMap = new Map(savedAnswers.map((a) => [a.question_version_id, a.answer]));

  const enrichedQuestions = questions.map((q) => {
    let qOptions = options.filter((o) => o.question_version_id === q.question_version_id);
    if (q.option_order && Array.isArray(q.option_order)) {
      const orderMap = new Map(q.option_order.map((id, idx) => [id, idx]));
      qOptions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    } else {
      qOptions.sort((a, b) => a.position - b.position);
    }
    return {
      position: q.position,
      questionVersionId: q.question_version_id,
      typeCode: q.type_code,
      bodyMd: q.body_md,
      points: q.points,
      options: qOptions,
      config: sanitizeConfigForStudent(q.type_code, q.config),
      savedAnswer: answersMap.get(q.question_version_id) ?? null,
    };
  });

  res.json({
    success: true,
    data: {
      session: {
        id: session.id,
        status: session.status,
        examId: session.exam_id,
        examTitle: session.exam_title,
        monitorFocus: session.monitor_focus,
        deadlineAt: session.deadline_at,
        remainingSeconds,
      },
      questions: enrichedQuestions,
    },
  });
});

// ==========================================
// 5. Autosave Student Answer
// ==========================================

studentRouter.post('/sessions/:id/save', requireApprovedStudent, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    questionVersionId: z.string().uuid(),
    answer: z.record(z.any()),
    seq: z.coerce.number().int().default(1),
  }).parse(req.body);

  const studentId = req.auth.user.id;

  const { rows: sessionRows } = await query(
    `SELECT s.id, s.status, s.deadline_at
       FROM exam_sessions s
       JOIN exam_enrollments en ON en.id = s.enrollment_id
      WHERE s.id = $1 AND en.student_id = $2`,
    [id, studentId]
  );
  const session = sessionRows[0];
  if (!session) throw AppError.notFound('Session not found');
  if (session.status !== 'IN_PROGRESS') throw AppError.conflict('Session is no longer active');
  if (new Date() > new Date(session.deadline_at)) throw AppError.conflict('Exam time has expired');

  await query(
    `INSERT INTO student_answers (session_id, question_version_id, answer, seq, saved_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (session_id, question_version_id)
     DO UPDATE SET answer = EXCLUDED.answer, seq = EXCLUDED.seq, saved_at = now()`,
    [id, body.questionVersionId, JSON.stringify(body.answer), body.seq]
  );

  res.json({ success: true, data: { savedAt: new Date().toISOString() } });
});

// ==========================================
// 6. Submit Exam
// ==========================================

studentRouter.post('/sessions/:id/submit', requireApprovedStudent, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const studentId = req.auth.user.id;

  const result = await withTx(async (db) => {
    const { rows: sessionRows } = await db.query(
      `SELECT s.id, s.status, s.deadline_at
         FROM exam_sessions s
         JOIN exam_enrollments en ON en.id = s.enrollment_id
        WHERE s.id = $1 AND en.student_id = $2
        FOR UPDATE`,
      [id, studentId]
    );

    const session = sessionRows[0];
    if (!session) throw AppError.notFound('Session not found');
    if (session.status !== 'IN_PROGRESS') throw AppError.conflict('Session has already been submitted');

    const status = new Date() > new Date(session.deadline_at) ? 'AUTO_SUBMITTED' : 'SUBMITTED';

    await db.query(
      `UPDATE exam_sessions SET status = $2, submitted_at = now() WHERE id = $1`,
      [id, status]
    );

    const grading = await gradeSession(id, db);
    await audit({ actorId: studentId, action: 'EXAM_SUBMITTED', entityType: 'exam_session', entityId: id, ip: req.ip }, db);

    return {
      sessionId: id,
      status,
      submittedAt: new Date(),
      resultsPublished: !!grading.submission.results_published_at,
      score: grading.submission.results_published_at ? grading.totalScore : null,
      percentage: grading.submission.results_published_at ? grading.percentage : null,
      passed: grading.submission.results_published_at ? grading.passed : null,
    };
  });

  res.json({ success: true, data: result });
});

// ==========================================
// 7. Integrity Monitoring (Security Events)
// ==========================================

studentRouter.post('/sessions/:id/security-event', requireApprovedStudent, async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const body = z.object({
    eventType: z.string().min(1).max(50),
    severity: z.enum(['INFO', 'NOTICE', 'WARNING']).default('WARNING'),
    details: z.record(z.any()).default({}),
    clientTs: z.coerce.date().optional(),
  }).parse(req.body);

  const studentId = req.auth.user.id;

  const { rowCount } = await query(
    `INSERT INTO security_events (session_id, user_id, event_type, severity, details, ip, client_ts)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, studentId, body.eventType, body.severity, JSON.stringify(body.details), req.ip, body.clientTs ?? new Date()]
  );

  res.json({ success: true, data: { recorded: rowCount > 0 } });
});

// ==========================================
// 8. Results List & Detail
// ==========================================

studentRouter.get('/results', async (req, res) => {
  const studentId = req.auth.user.id;

  const { rows } = await query(
    `SELECT s.id AS session_id, s.attempt_no, s.submitted_at, s.status AS session_status,
            e.id AS exam_id, e.title AS exam_title, e.max_score, e.passing_score,
            c.name AS course_name, c.code AS course_code,
            sub.total_score, sub.percentage, sub.passed, sub.results_published_at
       FROM exam_sessions s
       JOIN exam_enrollments en ON en.id = s.enrollment_id
       JOIN exams e ON e.id = en.exam_id
       JOIN courses c ON c.id = e.course_id
       JOIN submissions sub ON sub.session_id = s.id
      WHERE en.student_id = $1
      ORDER BY s.submitted_at DESC`,
    [studentId]
  );

  res.json({ success: true, data: rows });
});

studentRouter.get('/results/:sessionId', async (req, res) => {
  const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(req.params);
  const studentId = req.auth.user.id;

  const { rows: subRows } = await query(
    `SELECT sub.total_score, sub.percentage, sub.passed, sub.results_published_at,
            e.id AS exam_id, e.title AS exam_title, e.max_score, e.passing_score, e.show_feedback,
            c.name AS course_name
       FROM submissions sub
       JOIN exam_sessions s ON s.id = sub.session_id
       JOIN exam_enrollments en ON en.id = s.enrollment_id
       JOIN exams e ON e.id = en.exam_id
       JOIN courses c ON c.id = e.course_id
      WHERE sub.session_id = $1 AND en.student_id = $2`,
    [sessionId, studentId]
  );

  const sub = subRows[0];
  if (!sub) throw AppError.notFound('Result not found');

  if (!sub.results_published_at) {
    return res.json({
      success: true,
      data: {
        published: false,
        examTitle: sub.exam_title,
        courseName: sub.course_name,
        message: 'Results have not been published yet.',
      },
    });
  }

  // If published, include question review
  const { rows: questions } = await query(
    `SELECT sq.position, sq.points AS max_points,
            qv.type_code, qv.body_md, qv.config,
            CASE WHEN $2 = true THEN qv.explanation_md ELSE null END AS explanation_md,
            sa.answer AS student_answer,
            g.final_score
       FROM session_questions sq
       JOIN question_versions qv ON qv.id = sq.question_version_id
       LEFT JOIN student_answers sa ON sa.session_id = sq.session_id AND sa.question_version_id = sq.question_version_id
       LEFT JOIN grades g ON g.session_id = sq.session_id AND g.question_version_id = sq.question_version_id
      WHERE sq.session_id = $1
      ORDER BY sq.position`,
    [sessionId, sub.show_feedback]
  );

  res.json({
    success: true,
    data: {
      published: true,
      ...sub,
      questions,
    },
  });
});
