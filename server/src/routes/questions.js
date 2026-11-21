import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../utils/AppError.js';
import { requireAuth, requireRole } from '../middleware/security.js';

export const questionsRouter = Router();
questionsRouter.use(requireAuth, requireRole('PROFESSOR', 'ADMIN'));

// ==========================================
// Question Types & Categories
// ==========================================

questionsRouter.get('/types', async (_req, res) => {
  const { rows } = await query('SELECT code FROM question_types ORDER BY code');
  res.json({ success: true, data: rows.map((r) => r.code) });
});

questionsRouter.get('/categories', async (req, res) => {
  const { rows } = await query(
    `WITH RECURSIVE cat_hierarchy AS (
       SELECT id, name, parent_id, name::text AS path, 0 AS depth
         FROM question_categories
        WHERE owner_id = $1 AND parent_id IS NULL
       UNION ALL
       SELECT c.id, c.name, c.parent_id, (h.path || ' > ' || c.name)::text, h.depth + 1
         FROM question_categories c
         JOIN cat_hierarchy h ON c.parent_id = h.id
        WHERE h.depth < 10
     )
     SELECT id, name, parent_id, path, depth
       FROM cat_hierarchy
      UNION ALL
      SELECT id, name, parent_id, name AS path, 0 AS depth
        FROM question_categories
       WHERE owner_id = $1 AND id NOT IN (SELECT id FROM cat_hierarchy)
      ORDER BY path`,
    [req.auth.user.id]
  );
  res.json({ success: true, data: rows });
});

questionsRouter.post('/categories', async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(100),
    parentId: z.string().uuid().optional().nullable(),
  }).parse(req.body);

  if (body.parentId) {
    const { rows: pRows } = await query(
      `SELECT id FROM question_categories WHERE id = $1 AND owner_id = $2`,
      [body.parentId, req.auth.user.id]
    );
    if (!pRows[0]) throw AppError.badRequest('Parent category not found');
  }

  const { rows } = await query(
    `INSERT INTO question_categories (owner_id, parent_id, name)
     VALUES ($1, $2, $3) RETURNING id, name, parent_id`,
    [req.auth.user.id, body.parentId ?? null, body.name]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

questionsRouter.delete('/categories/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rowCount } = await query(
    `DELETE FROM question_categories WHERE id = $1 AND owner_id = $2`,
    [id, req.auth.user.id]
  );
  if (!rowCount) throw AppError.notFound('Category not found');
  res.json({ success: true, data: { id, deleted: true } });
});

// ==========================================
// Question Schemas
// ==========================================

const optionSchema = z.object({
  position: z.number().int().min(0),
  bodyMd: z.string().trim().min(1),
  isCorrect: z.boolean().default(false),
  feedbackMd: z.string().trim().optional().nullable(),
});

const questionCreateSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  typeCode: z.string().min(1),
  locale: z.enum(['ar', 'fr', 'en']).default('fr'),
  bodyMd: z.string().trim().min(1),
  explanationMd: z.string().trim().optional().nullable(),
  defaultPoints: z.coerce.number().min(0).default(1),
  config: z.record(z.any()).default({}),
  options: z.array(optionSchema).default([]),
});

// ==========================================
// Questions CRUD
// ==========================================

questionsRouter.get('/', async (req, res) => {
  const f = z.object({
    categoryId: z.string().uuid().optional(),
    typeCode: z.string().optional(),
    q: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);

  const { rows } = await query(
    `WITH RECURSIVE cat_tree AS (
       SELECT id FROM question_categories WHERE id = $2 AND owner_id = $1
       UNION ALL
       SELECT qc.id FROM question_categories qc JOIN cat_tree ct ON qc.parent_id = ct.id
     ),
     cat_paths AS (
       SELECT id, name, parent_id, name::text AS path, 0 AS depth
         FROM question_categories
        WHERE owner_id = $1 AND parent_id IS NULL
       UNION ALL
       SELECT c.id, c.name, c.parent_id, (cp.path || ' > ' || c.name)::text, cp.depth + 1
         FROM question_categories c
         JOIN cat_paths cp ON c.parent_id = cp.id
        WHERE cp.depth < 10
     )
     SELECT q.id, q.category_id, qc.name AS category_name, COALESCE(cp.path, qc.name) AS category_path, q.created_at,
            qv.id AS version_id, qv.version, qv.type_code, qv.locale, qv.body_md,
            qv.explanation_md, qv.default_points, qv.config,
            COALESCE(
              (SELECT json_agg(
                        json_build_object(
                          'id', ao.id,
                          'position', ao.position,
                          'body_md', ao.body_md,
                          'bodyMd', ao.body_md,
                          'is_correct', ao.is_correct,
                          'isCorrect', ao.is_correct,
                          'feedback_md', ao.feedback_md
                        ) ORDER BY ao.position
                      )
                 FROM answer_options ao
                WHERE ao.question_version_id = qv.id),
              '[]'::json
            ) AS options
       FROM questions q
       LEFT JOIN question_categories qc ON qc.id = q.category_id
       LEFT JOIN cat_paths cp ON cp.id = q.category_id
       JOIN LATERAL (
         SELECT * FROM question_versions WHERE question_id = q.id ORDER BY version DESC LIMIT 1
       ) qv ON true
      WHERE q.owner_id = $1 AND q.archived_at IS NULL
        AND ($2::uuid IS NULL OR q.category_id IN (SELECT id FROM cat_tree))
        AND ($3::text IS NULL OR qv.type_code = $3)
        AND ($4::text IS NULL OR qv.body_md ILIKE '%'||$4||'%')
      ORDER BY q.created_at DESC
      LIMIT $5 OFFSET $6`,
    [req.auth.user.id, f.categoryId ?? null, f.typeCode ?? null, f.q ?? null, f.limit, f.offset]
  );

  res.json({ success: true, data: rows });
});

questionsRouter.post('/', async (req, res) => {
  const b = questionCreateSchema.parse(req.body);

  const result = await withTx(async (db) => {
    // 1. Create base question
    const { rows: qRows } = await db.query(
      `INSERT INTO questions (owner_id, category_id) VALUES ($1, $2) RETURNING id, created_at`,
      [req.auth.user.id, b.categoryId ?? null]
    );
    const questionId = qRows[0].id;

    // 2. Create question version 1
    const { rows: vRows } = await db.query(
      `INSERT INTO question_versions (question_id, version, type_code, locale, body_md, explanation_md, default_points, config)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7)
       RETURNING id, version, type_code, locale, body_md, explanation_md, default_points, config`,
      [questionId, b.typeCode, b.locale, b.bodyMd, b.explanationMd ?? null, b.defaultPoints, JSON.stringify(b.config)]
    );
    const version = vRows[0];

    // 3. Insert options if any
    let options = [];
    if (b.options.length > 0) {
      for (const opt of b.options) {
        const { rows: optRows } = await db.query(
          `INSERT INTO answer_options (question_version_id, position, body_md, is_correct, feedback_md)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, position, body_md, is_correct, feedback_md`,
          [version.id, opt.position, opt.bodyMd, opt.isCorrect, opt.feedbackMd ?? null]
        );
        options.push(optRows[0]);
      }
    }

    await audit({
      actorId: req.auth.user.id,
      action: 'QUESTION_CREATED',
      entityType: 'question',
      entityId: questionId,
      after: { questionId, versionId: version.id, type: b.typeCode },
      ip: req.ip,
    }, db);

    return {
      id: questionId,
      categoryId: b.categoryId,
      ...version,
      options,
    };
  });

  res.status(201).json({ success: true, data: result });
});

questionsRouter.get('/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  const { rows } = await query(
    `SELECT q.id, q.category_id, q.created_at,
            qv.id AS version_id, qv.version, qv.type_code, qv.locale, qv.body_md,
            qv.explanation_md, qv.default_points, qv.config
       FROM questions q
       JOIN LATERAL (
         SELECT * FROM question_versions WHERE question_id = q.id ORDER BY version DESC LIMIT 1
       ) qv ON true
      WHERE q.id = $1 AND q.owner_id = $2 AND q.archived_at IS NULL`,
    [id, req.auth.user.id]
  );
  if (!rows[0]) throw AppError.notFound('Question not found');

  const question = rows[0];
  const { rows: options } = await query(
    `SELECT id, position, body_md, is_correct, feedback_md
       FROM answer_options WHERE question_version_id = $1 ORDER BY position`,
    [question.version_id]
  );

  res.json({ success: true, data: { ...question, options } });
});

questionsRouter.put('/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const b = questionCreateSchema.parse(req.body);

  const result = await withTx(async (db) => {
    // Check owner
    const { rows: qRows } = await db.query(
      `SELECT id, category_id FROM questions WHERE id = $1 AND owner_id = $2 AND archived_at IS NULL FOR UPDATE`,
      [id, req.auth.user.id]
    );
    if (!qRows[0]) throw AppError.notFound('Question not found');

    if (b.categoryId !== undefined) {
      await db.query(`UPDATE questions SET category_id = $2 WHERE id = $1`, [id, b.categoryId ?? null]);
    }

    // Get max version
    const { rows: vMax } = await db.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM question_versions WHERE question_id = $1`,
      [id]
    );
    const nextVersion = vMax[0].next_version;

    // Insert new version
    const { rows: vRows } = await db.query(
      `INSERT INTO question_versions (question_id, version, type_code, locale, body_md, explanation_md, default_points, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, version, type_code, locale, body_md, explanation_md, default_points, config`,
      [id, nextVersion, b.typeCode, b.locale, b.bodyMd, b.explanationMd ?? null, b.defaultPoints, JSON.stringify(b.config)]
    );
    const version = vRows[0];

    // Insert options
    let options = [];
    if (b.options.length > 0) {
      for (const opt of b.options) {
        const { rows: optRows } = await db.query(
          `INSERT INTO answer_options (question_version_id, position, body_md, is_correct, feedback_md)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, position, body_md, is_correct, feedback_md`,
          [version.id, opt.position, opt.bodyMd, opt.isCorrect, opt.feedbackMd ?? null]
        );
        options.push(optRows[0]);
      }
    }

    await audit({
      actorId: req.auth.user.id,
      action: 'QUESTION_UPDATED',
      entityType: 'question',
      entityId: id,
      after: { questionId: id, versionId: version.id, version: nextVersion },
      ip: req.ip,
    }, db);

    return {
      id,
      categoryId: b.categoryId,
      ...version,
      options,
    };
  });

  res.json({ success: true, data: result });
});

questionsRouter.delete('/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { rowCount } = await query(
    `UPDATE questions SET archived_at = now() WHERE id = $1 AND owner_id = $2`,
    [id, req.auth.user.id]
  );
  if (!rowCount) throw AppError.notFound('Question not found');
  await audit({ actorId: req.auth.user.id, action: 'QUESTION_ARCHIVED', entityType: 'question', entityId: id, ip: req.ip });
  res.json({ success: true, data: { id, archived: true } });
});
