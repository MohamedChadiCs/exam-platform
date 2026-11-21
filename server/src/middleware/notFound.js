import { AppError } from '../utils/AppError.js';

export function notFound(_req, _res, next) {
  next(AppError.notFound('Route not found'));
}
