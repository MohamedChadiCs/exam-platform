import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

const fail = (res, status, code, message, details) =>
  res.status(status).json({ success: false, error: { code, message, ...(details && { details }) } });

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Invalid request data',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof AppError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'BAD_JSON', 'Malformed JSON body');
  if (err.type === 'entity.too.large') return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');

  req.log.error({ err }, 'unhandled error');
  return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
}
