import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../lib/db.js';
import { AppError } from '../utils/AppError.js';
import { requireAuth, requireRole } from '../middleware/security.js';

export const uploadsRouter = Router();

// Max file size: 5 MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4',
  'video/mp4', 'video/webm', 'video/ogg',
];

// ==========================================
// Upload attachment (base64 body — no multer needed)
// ==========================================

uploadsRouter.post(
  '/question-attachment',
  requireAuth,
  requireRole('PROFESSOR', 'ADMIN'),
  async (req, res) => {
    const body = z.object({
      questionVersionId: z.string().uuid().optional().nullable(),
      filename: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(1),
      dataBase64: z.string().min(1),
      position: z.coerce.number().int().min(0).default(0),
    }).parse(req.body);

    if (!ALLOWED_MIME_TYPES.includes(body.mimeType)) {
      throw AppError.badRequest(`Unsupported file type: ${body.mimeType}. Allowed: images, audio, video.`);
    }

    const buf = Buffer.from(body.dataBase64, 'base64');
    if (buf.length > MAX_FILE_SIZE) {
      throw AppError.badRequest(`File too large (${(buf.length / 1024 / 1024).toFixed(1)} MB). Max: 5 MB.`);
    }

    // Verify ownership of the question version if provided
    if (body.questionVersionId) {
      const { rows: qvRows } = await query(
        `SELECT qv.id FROM question_versions qv
           JOIN questions q ON q.id = qv.question_id
          WHERE qv.id = $1 AND (q.owner_id = $2 OR $3 = 'ADMIN')`,
        [body.questionVersionId, req.auth.user.id, req.auth.user.role]
      );
      if (!qvRows[0]) throw AppError.notFound('Question version not found or not owned by you');
    }

    const { rows } = await query(
      `INSERT INTO question_attachments (question_version_id, owner_id, filename, mime_type, size_bytes, data, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, question_version_id, filename, mime_type, size_bytes, position, created_at`,
      [body.questionVersionId ?? null, req.auth.user.id, body.filename, body.mimeType, buf.length, buf, body.position]
    );

    const attachment = rows[0];
    res.status(201).json({
      success: true,
      data: {
        ...attachment,
        url: `/api/v1/uploads/${attachment.id}`,
      },
    });
  }
);

// ==========================================
// Serve attachment (public — students need to see them during exams)
// ==========================================

uploadsRouter.get('/:id', async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  const { rows } = await query(
    `SELECT filename, mime_type, data, size_bytes FROM question_attachments WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw AppError.notFound('Attachment not found');

  const att = rows[0];
  res.set({
    'Content-Type': att.mime_type,
    'Content-Length': att.size_bytes,
    'Content-Disposition': `inline; filename="${att.filename}"`,
    'Cache-Control': 'public, max-age=86400',
  });
  res.send(att.data);
});

// ==========================================
// Delete attachment
// ==========================================

uploadsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('PROFESSOR', 'ADMIN'),
  async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const { rowCount } = await query(
      `DELETE FROM question_attachments WHERE id = $1 AND (owner_id = $2 OR $3 = 'ADMIN')`,
      [id, req.auth.user.id, req.auth.user.role]
    );
    if (!rowCount) throw AppError.notFound('Attachment not found or not owned by you');

    res.json({ success: true, data: { deleted: true } });
  }
);

// ==========================================
// List attachments for a question version
// ==========================================

uploadsRouter.get('/question/:qvId', async (req, res) => {
  const { qvId } = z.object({ qvId: z.string().uuid() }).parse(req.params);

  const { rows } = await query(
    `SELECT id, filename, mime_type, size_bytes, position, created_at
       FROM question_attachments WHERE question_version_id = $1
       ORDER BY position, created_at`,
    [qvId]
  );

  res.json({ success: true, data: rows });
});
