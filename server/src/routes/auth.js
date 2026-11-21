import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { query, withTx } from '../lib/db.js';
import { env } from '../config/env.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { sendMail } from '../lib/mailer.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../utils/AppError.js';
import { createSession, revokeSession, revokeAllForUser, SESSION_COOKIE, ABSOLUTE_HOURS } from '../services/sessions.js';
import { requireAuth, csrfTokenFor } from '../middleware/security.js';

const HASH_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const DUMMY_HASH = await argon2.hash('timing-equalizer-password', HASH_OPTS); // so unknown emails cost the same as known ones

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, 'at least 10 characters').max(128);
const name = z.string().trim().min(1).max(80);
const locale = z.enum(['ar', 'fr', 'en']);

const registerSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('STUDENT'), email, password, firstName: name, lastName: name, locale: locale.default('fr'),
    matricule: z.string().trim().min(3).max(30), classId: z.string().uuid().optional(),
  }).strict(),
  z.object({
    role: z.literal('PROFESSOR'), email, password, firstName: name, lastName: name, locale: locale.default('fr'),
    departmentId: z.string().uuid().optional(), title: z.string().trim().max(60).optional(),
  }).strict(),
]);
const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
const tokenSchema = z.object({ token: z.string().min(20).max(200) }).strict();
const forgotSchema = z.object({ email }).strict();
const resetSchema = z.object({ token: z.string().min(20).max(200), password }).strict();

const GENERIC_REGISTER_STUDENT = { message: 'If the data is valid, a verification email has been sent.', autoLogin: false };
const GENERIC_REGISTER_PROFESSOR = { message: 'Account created. You can now log in.', autoLogin: true };
const GENERIC_FORGOT = { message: 'If an account exists for this email, a reset link has been sent.' };

async function issueToken(userId, purpose, ttlMinutes, db = { query }) {
  const token = randomToken(32);
  await db.query(
    `UPDATE auth_tokens SET used_at = now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL`, [userId, purpose]);
  await db.query(
    `INSERT INTO auth_tokens(user_id,purpose,token_hash,expires_at)
     VALUES ($1,$2,$3, now() + make_interval(mins => $4))`, [userId, purpose, sha256(token), ttlMinutes]);
  return token;
}

const publicUser = (u) => ({
  id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, locale: u.locale, role: u.role,
});

export function createAuthRouter(limiters) {
  const r = Router();

  r.post('/register', limiters.registerByIp, async (req, res) => {
    const d = registerSchema.parse(req.body);
    const hash = await argon2.hash(d.password, HASH_OPTS);
    const isProfessor = d.role === 'PROFESSOR';
    let verifyToken = null;
    let newUser = null;
    try {
      await withTx(async (db) => {
        // Professors are ACTIVE immediately (no email verification needed).
        // Students must verify their email first.
        const status = isProfessor ? 'ACTIVE' : 'PENDING_EMAIL';
        const { rows } = await db.query(
          `INSERT INTO users(email,password_hash,role_id,first_name,last_name,locale,status,email_verified_at)
           VALUES ($1,$2,(SELECT id FROM roles WHERE code=$3),$4,$5,$6,$7,$8) RETURNING id, email, first_name, last_name, locale`,
          [d.email, hash, d.role, d.firstName, d.lastName, d.locale,
           status, isProfessor ? new Date() : null]);
        const row = rows[0];
        if (d.role === 'STUDENT') {
          await db.query('INSERT INTO students(user_id,matricule) VALUES ($1,$2)',
            [row.id, d.matricule]);
          if (d.classId) {
            await db.query('INSERT INTO class_students(class_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [d.classId, row.id]);
          }
          verifyToken = await issueToken(row.id, 'VERIFY_EMAIL', 24 * 60, db);
        } else {
          await db.query('INSERT INTO professors(user_id,department_id,title) VALUES ($1,$2,$3)',
            [row.id, d.departmentId ?? null, d.title ?? null]);
          newUser = { ...row, role: d.role };
        }
        await audit({ actorId: row.id, action: 'USER_REGISTERED', entityType: 'user', entityId: row.id, ip: req.ip }, db);
      });
    } catch (err) {
      // 23505 unique (email/matricule), 23503 bad FK (class/department): answer identically so nothing leaks
      if (err.code !== '23505' && err.code !== '23503') throw err;
    }
    if (verifyToken) {
      await sendMail({
        to: d.email, subject: 'Verify your email',
        text: `Welcome! Verify your account (valid 24h):\n${env.CLIENT_ORIGIN}/verify-email?token=${verifyToken}\n`,
      });
    }
    // Auto-login for professors: create session and set cookie
    if (isProfessor) {
      if (newUser) {
        const token = await createSession(newUser.id, req);
        await query('UPDATE users SET last_login_at = now() WHERE id=$1', [newUser.id]);
        await audit({ actorId: newUser.id, action: 'LOGIN', entityType: 'user', entityId: newUser.id, ip: req.ip });
        res.cookie(SESSION_COOKIE, token, {
          httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax',
          maxAge: ABSOLUTE_HOURS * 3600_000, path: '/',
        });
        return res.status(201).json({ success: true, data: { user: publicUser(newUser), csrfToken: csrfTokenFor(sha256(token)) } });
      }
      // If email already existed: check if this is the professor logging in with their password
      const { rows: existingRows } = await query(
        `SELECT u.*, r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE lower(u.email)=$1`, [d.email]
      );
      const existingUser = existingRows[0];
      if (existingUser && existingUser.role === 'PROFESSOR') {
        const passwordOk = await argon2.verify(existingUser.password_hash, d.password).catch(() => false);
        if (passwordOk && (existingUser.status === 'ACTIVE' || existingUser.status === 'PENDING_EMAIL')) {
          if (existingUser.status === 'PENDING_EMAIL') {
            await query(`UPDATE users SET status='ACTIVE', email_verified_at=COALESCE(email_verified_at, now()), updated_at=now() WHERE id=$1`, [existingUser.id]);
            existingUser.status = 'ACTIVE';
          }
          const token = await createSession(existingUser.id, req);
          await query('UPDATE users SET last_login_at = now() WHERE id=$1', [existingUser.id]);
          await audit({ actorId: existingUser.id, action: 'LOGIN', entityType: 'user', entityId: existingUser.id, ip: req.ip });
          res.cookie(SESSION_COOKIE, token, {
            httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax',
            maxAge: ABSOLUTE_HOURS * 3600_000, path: '/',
          });
          return res.status(201).json({ success: true, data: { user: publicUser(existingUser), csrfToken: csrfTokenFor(sha256(token)) } });
        }
      }
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists. Please log in.');
    }
    res.status(202).json({ success: true, data: GENERIC_REGISTER_STUDENT });
  });

  r.post('/verify-email', async (req, res) => {
    const { token } = tokenSchema.parse(req.body);
    const ok = await withTx(async (db) => {
      const t = await db.query(
        `UPDATE auth_tokens SET used_at = now()
          WHERE token_hash=$1 AND purpose='VERIFY_EMAIL' AND used_at IS NULL AND expires_at > now()
          RETURNING user_id`, [sha256(token)]);
      if (!t.rows[0]) return false;
      await db.query(
        `UPDATE users SET status='ACTIVE', email_verified_at=now(), updated_at=now()
          WHERE id=$1 AND status='PENDING_EMAIL'`, [t.rows[0].user_id]);
      return true;
    });
    if (!ok) throw AppError.badRequest('Invalid or expired token');
    res.json({ success: true, data: { message: 'Email verified. You can now log in.' } });
  });

  r.post('/login', limiters.loginByIp, limiters.loginByAccount, async (req, res) => {
    const { email: addr, password: pw } = loginSchema.parse(req.body);
    const { rows } = await query(
      `SELECT u.*, r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE lower(u.email)=$1`, [addr]);
    let u = rows[0];
    const passwordOk = await argon2.verify(u?.password_hash ?? DUMMY_HASH, pw).catch(() => false);
    if (!u || !passwordOk) {
      await audit({ action: 'LOGIN_FAILED', entityType: 'user', entityId: u?.id, ip: req.ip, after: { email: addr } });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    // timed ban that has run out: lift lazily
    if (u.status === 'SUSPENDED' && u.suspended_until && u.suspended_until <= new Date()) {
      await query(`UPDATE users SET status='ACTIVE', suspended_at=NULL, suspended_until=NULL,
                   suspension_reason=NULL, updated_at=now() WHERE id=$1`, [u.id]);
      u = { ...u, status: 'ACTIVE' };
    }
    // Professors never require email verification — auto-activate if needed
    if (u.role === 'PROFESSOR' && u.status === 'PENDING_EMAIL') {
      await query(`UPDATE users SET status='ACTIVE', email_verified_at=COALESCE(email_verified_at, now()), updated_at=now() WHERE id=$1`, [u.id]);
      u = { ...u, status: 'ACTIVE' };
    }
    if (u.status === 'PENDING_EMAIL') throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email first');
    if (u.status === 'SUSPENDED') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended',
        { reason: u.suspension_reason, until: u.suspended_until });
    }
    if (u.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is not active');

    const token = await createSession(u.id, req); // new id on every login: no session fixation
    await query('UPDATE users SET last_login_at = now() WHERE id=$1', [u.id]);
    await audit({ actorId: u.id, action: 'LOGIN', entityType: 'user', entityId: u.id, ip: req.ip });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax',
      maxAge: ABSOLUTE_HOURS * 3600_000, path: '/',
    });
    res.json({ success: true, data: { user: publicUser(u), csrfToken: csrfTokenFor(sha256(token)) } });
  });

  r.post('/logout', requireAuth, async (req, res) => {
    await revokeSession(req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ success: true, data: { message: 'Logged out' } });
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ success: true, data: { user: publicUser(req.auth.user), csrfToken: csrfTokenFor(req.auth.idHash) } });
  });

  r.post('/forgot-password', limiters.mailByIp, limiters.mailByAccount, async (req, res) => {
    const { email: addr } = forgotSchema.parse(req.body);
    const { rows } = await query(`SELECT id, status FROM users WHERE lower(email)=$1`, [addr]);
    const u = rows[0];
    if (u && (u.status === 'ACTIVE' || u.status === 'PENDING_EMAIL')) {
      const token = await issueToken(u.id, 'RESET_PASSWORD', 30);
      await audit({ actorId: u.id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: u.id, ip: req.ip });
      await sendMail({
        to: addr, subject: 'Reset your password',
        text: `Reset your password (valid 30 minutes, single use):\n${env.CLIENT_ORIGIN}/reset-password?token=${token}\nIf you did not ask for this, ignore this email.\n`,
      });
    }
    res.status(202).json({ success: true, data: GENERIC_FORGOT }); // identical either way
  });

  r.post('/reset-password', limiters.mailByIp, async (req, res) => {
    const { token, password: pw } = resetSchema.parse(req.body);
    const hash = await argon2.hash(pw, HASH_OPTS);
    const ok = await withTx(async (db) => {
      const t = await db.query(
        `UPDATE auth_tokens SET used_at = now()
          WHERE token_hash=$1 AND purpose='RESET_PASSWORD' AND used_at IS NULL AND expires_at > now()
          RETURNING user_id`, [sha256(token)]);
      if (!t.rows[0]) return false;
      const userId = t.rows[0].user_id;
      // proving control of the mailbox also verifies the email
      await db.query(
        `UPDATE users SET password_hash=$2, updated_at=now(),
                status = CASE WHEN status='PENDING_EMAIL' THEN 'ACTIVE' ELSE status END,
                email_verified_at = COALESCE(email_verified_at, now())
          WHERE id=$1`, [userId, hash]);
      await revokeAllForUser(userId, db);
      await audit({ actorId: userId, action: 'PASSWORD_RESET_DONE', entityType: 'user', entityId: userId, ip: req.ip }, db);
      return true;
    });
    if (!ok) throw AppError.badRequest('Invalid or expired token');
    res.json({ success: true, data: { message: 'Password updated. Please log in.' } });
  });

  return r;
}
