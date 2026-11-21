import { Router } from 'express';
import { query } from '../lib/db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await query('SELECT now() AS db_time');
    res.json({ success: true, data: { status: 'ok', dbTime: rows[0].db_time } });
  } catch {
    res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database unavailable' } });
  }
});
