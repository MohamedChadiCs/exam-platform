import { withTx } from '../lib/db.js';

/**
 * Grade a student's session:
 * Computes scores for all answered questions based on their type,
 * creates or updates `grades`, and creates/updates `submissions`.
 */
export async function gradeSession(sessionId, dbClient) {
  const runner = async (db) => {
    // 1. Fetch exam settings & session details
    const { rows: sessionRows } = await db.query(
      `SELECT s.id, s.enrollment_id, s.status, e.id AS exam_id, e.max_score, e.passing_score,
              e.negative_marking, e.results_policy
         FROM exam_sessions s
         JOIN exam_enrollments en ON en.id = s.enrollment_id
         JOIN exams e ON e.id = en.exam_id
        WHERE s.id = $1`,
      [sessionId]
    );
    const session = sessionRows[0];
    if (!session) throw new Error('Session not found');

    // 2. Fetch all session questions and their version details
    const { rows: questions } = await db.query(
      `SELECT sq.question_version_id, sq.points, qv.type_code, qv.config
         FROM session_questions sq
         JOIN question_versions qv ON qv.id = sq.question_version_id
        WHERE sq.session_id = $1`,
      [sessionId]
    );

    // 3. Fetch all answer options for these question versions
    const qvIds = questions.map((q) => q.question_version_id);
    let options = [];
    if (qvIds.length > 0) {
      const { rows: optRows } = await db.query(
        `SELECT id, question_version_id, is_correct FROM answer_options WHERE question_version_id = ANY($1::uuid[])`,
        [qvIds]
      );
      options = optRows;
    }

    // 4. Fetch student's submitted answers
    const { rows: studentAnswers } = await db.query(
      `SELECT question_version_id, answer FROM student_answers WHERE session_id = $1`,
      [sessionId]
    );
    const answersMap = new Map(studentAnswers.map((a) => [a.question_version_id, a.answer]));

    let totalScore = 0;
    let anyNeedsManual = false;

    for (const q of questions) {
      const qvId = q.question_version_id;
      const maxPts = Number(q.points);
      const studentAns = answersMap.get(qvId);
      const qOptions = options.filter((o) => o.question_version_id === qvId);
      const correctOptionIds = qOptions.filter((o) => o.is_correct).map((o) => o.id);

      let autoScore = 0;
      let needsManual = false;

      if (!studentAns) {
        autoScore = 0;
      } else if (q.type_code === 'MCQ_SINGLE' || q.type_code === 'TRUE_FALSE') {
        const selected = studentAns.selectedOptionId ?? (Array.isArray(studentAns.selectedOptionIds) ? studentAns.selectedOptionIds[0] : null);
        if (selected && correctOptionIds.includes(selected)) {
          autoScore = maxPts;
        } else if (session.negative_marking && selected) {
          autoScore = -Math.round((maxPts / (qOptions.length - 1 || 1)) * 100) / 100;
        } else {
          autoScore = 0;
        }
      } else if (q.type_code === 'MCQ_MULTI') {
        const selected = Array.isArray(studentAns.selectedOptionIds) ? studentAns.selectedOptionIds : [];
        const correctSet = new Set(correctOptionIds);
        const correctSelected = selected.filter((id) => correctSet.has(id)).length;
        const incorrectSelected = selected.filter((id) => !correctSet.has(id)).length;

        if (correctOptionIds.length === 0) {
          autoScore = 0;
        } else if (incorrectSelected === 0 && correctSelected === correctOptionIds.length) {
          autoScore = maxPts;
        } else {
          // Partial credit: proportion of correct minus incorrect penalty
          const fraction = Math.max(0, (correctSelected - incorrectSelected) / correctOptionIds.length);
          autoScore = Math.round(maxPts * fraction * 100) / 100;
        }
      } else if (q.type_code === 'NUMERIC') {
        const expected = q.config?.answer !== undefined ? Number(q.config.answer) : null;
        const tolerance = q.config?.tolerance !== undefined ? Number(q.config.tolerance) : 0;
        const studentVal = studentAns.value !== undefined ? Number(studentAns.value) : null;

        if (expected !== null && studentVal !== null && !isNaN(studentVal) && Math.abs(studentVal - expected) <= tolerance) {
          autoScore = maxPts;
        } else {
          autoScore = 0;
        }
      } else if (q.type_code === 'MATCHING') {
        const pairs = Array.isArray(q.config?.pairs) ? q.config.pairs : [];
        const studentMatches = studentAns.matches || studentAns.pairs || {};
        if (pairs.length === 0) {
          autoScore = 0;
        } else {
          let correctPairs = 0;
          for (let i = 0; i < pairs.length; i++) {
            const p = pairs[i];
            const pairKey = p.id || String(i);
            const studentRight = studentMatches[pairKey] !== undefined ? studentMatches[pairKey] : studentMatches[p.left];
            if (studentRight && String(studentRight).trim().toLowerCase() === String(p.right).trim().toLowerCase()) {
              correctPairs++;
            }
          }
          autoScore = Math.round((correctPairs / pairs.length) * maxPts * 100) / 100;
        }
      } else if (q.type_code === 'ORDERING') {
        const items = Array.isArray(q.config?.items) ? q.config.items : [];
        const studentOrder = Array.isArray(studentAns.order) ? studentAns.order : (Array.isArray(studentAns.items) ? studentAns.items : []);
        if (items.length === 0 || studentOrder.length === 0) {
          autoScore = 0;
        } else {
          let correctPositions = 0;
          for (let i = 0; i < items.length; i++) {
            if (studentOrder[i] && String(studentOrder[i]).trim() === String(items[i]).trim()) {
              correctPositions++;
            }
          }
          autoScore = Math.round((correctPositions / items.length) * maxPts * 100) / 100;
        }
      } else if (q.type_code === 'FILL_BLANK') {
        if (Array.isArray(q.config?.blanks) && q.config.blanks.length > 0) {
          let correctBlanks = 0;
          const blanks = q.config.blanks;
          for (let i = 0; i < blanks.length; i++) {
            const b = blanks[i];
            const blankKey = b.id ?? String(i + 1);
            const studentVal = String(
              (studentAns.blanks && (studentAns.blanks[blankKey] ?? studentAns.blanks[i])) ??
              studentAns[blankKey] ??
              ''
            ).trim().toLowerCase();
            const rawAcceptable = b.acceptableAnswers || b.acceptable || (b.answer ? [b.answer] : []);
            const acceptable = (Array.isArray(rawAcceptable) ? rawAcceptable : [rawAcceptable]).map((s) => String(s).trim().toLowerCase());
            if (studentVal && acceptable.includes(studentVal)) {
              correctBlanks++;
            }
          }
          autoScore = Math.round((correctBlanks / blanks.length) * maxPts * 100) / 100;
        } else if (q.config?.acceptableAnswers && Array.isArray(q.config.acceptableAnswers)) {
          const acceptable = q.config.acceptableAnswers.map((s) => String(s).trim().toLowerCase());
          const text = String(studentAns.text ?? studentAns.value ?? '').trim().toLowerCase();
          autoScore = acceptable.includes(text) ? maxPts : 0;
        } else {
          needsManual = true;
          anyNeedsManual = true;
          autoScore = null;
        }
      } else if (q.type_code === 'SHORT_TEXT' || q.type_code === 'LONG_TEXT' || q.type_code === 'ESSAY' || q.type_code === 'CODE') {
        needsManual = true;
        anyNeedsManual = true;
        autoScore = null;
      } else {
        needsManual = true;
        anyNeedsManual = true;
        autoScore = null;
      }

      const finalScore = autoScore !== null ? Math.max(0, autoScore) : 0;
      totalScore += finalScore;

      await db.query(
        `INSERT INTO grades (session_id, question_version_id, auto_score, final_score, needs_manual)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, question_version_id)
         DO UPDATE SET auto_score = EXCLUDED.auto_score,
                       final_score = CASE WHEN grades.manual_score IS NOT NULL THEN grades.manual_score ELSE EXCLUDED.final_score END,
                       needs_manual = EXCLUDED.needs_manual`,
        [sessionId, qvId, autoScore, finalScore, needsManual]
      );
    }

    const examMaxScore = Number(session.max_score);
    const percentage = examMaxScore > 0 ? Math.round((totalScore / examMaxScore) * 10000) / 100 : 0;
    const passed = totalScore >= Number(session.passing_score);
    const publishImmediate = session.results_policy === 'IMMEDIATE' && !anyNeedsManual;

    const { rows: subRows } = await db.query(
      `INSERT INTO submissions (session_id, total_score, percentage, passed, results_published_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id)
       DO UPDATE SET total_score = EXCLUDED.total_score,
                     percentage = EXCLUDED.percentage,
                     passed = EXCLUDED.passed,
                     results_published_at = COALESCE(submissions.results_published_at, EXCLUDED.results_published_at)
       RETURNING *`,
      [sessionId, totalScore, percentage, passed, publishImmediate ? new Date() : null]
    );

    return {
      submission: subRows[0],
      totalScore,
      percentage,
      passed,
      needsManual: anyNeedsManual,
    };
  };

  if (dbClient) {
    return runner(dbClient);
  }
  return withTx(runner);
}
