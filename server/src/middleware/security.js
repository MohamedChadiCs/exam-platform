import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { hmac, safeEqual } from '../lib/crypto.js';
import { SESSION_COOKIE, loadSession } from '../services/sessions.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Browsers always attach Origin to cross-site writes; reject foreign origins. */
export function originCheck(req, _res, next) {
  const origin = req.get('origin');
  if (!SAFE.has(req.method) && origin && origin !== env.CLIENT_ORIGIN) {
    return next(new AppError(403, 'BAD_ORIGIN', 'Request origin not allowed'));
  }
  next();
}

export const csrfTokenFor = (idHash) => hmac(env.CSRF_SECRET, idHash.toString('hex'));

/** Populates req.auth = { idHash, user } when a valid session cookie or Bearer token is present. */
export async function attachSession(req, _res, next) {
  const authHeader = req.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = req.cookies?.[SESSION_COOKIE] || bearer;
  if (typeof token === 'string' && token.length > 20 && token.length < 200) {
    req.auth = await loadSession(token);
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.auth) return next(AppError.unauthorized());
  if (!SAFE.has(req.method)) {
    const sent = req.get('x-csrf-token') || '';
    if (!safeEqual(sent, csrfTokenFor(req.auth.idHash))) {
      return next(new AppError(403, 'CSRF_INVALID', 'Missing or invalid CSRF token'));
    }
  }
  next();
}

/** RBAC. Always chain after requireAuth. */
export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.auth?.user.role) ? next() : next(AppError.forbidden('Insufficient permissions'));

const limited = (windowMs, limit, keyGenerator) => rateLimit({
  windowMs, limit, keyGenerator,
  standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } }),
});

const emailKey = (req) => String(req.body?.email ?? '').toLowerCase().slice(0, 200) || 'none';

/** Fresh limiter instances per app (so tests don't share counters). Keyed per-account first, per-IP second. */
export function createAuthLimiters() {
  return {
    loginByAccount: limited(15 * 60_000, 10, (req) => `acct:${emailKey(req)}`),
    loginByIp: limited(15 * 60_000, 100, (req) => `ip:${req.ip}`),
    registerByIp: limited(60 * 60_000, 30, (req) => `ip:${req.ip}`),
    mailByAccount: limited(60 * 60_000, 5, (req) => `acct:${emailKey(req)}`),
    mailByIp: limited(60 * 60_000, 30, (req) => `ip:${req.ip}`),
  };
}
