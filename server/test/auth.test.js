import { test, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool, outbox, resetDb, startApp, client, createAdmin, tokenFromMail } from './helpers.js';

let app;
// fresh app per test => fresh in-memory rate-limit counters
beforeEach(async () => { await resetDb(); app = await startApp(); });
afterEach(async () => { await app.close(); });
after(async () => { await pool.end(); });

const student = (o = {}) => ({
  role: 'STUDENT', email: 'stu@test.local', password: 'Student-Pass-123',
  firstName: 'Sara', lastName: 'Ben', matricule: 'M-1001', ...o,
});
async function registerAndVerify(c, data) {
  assert.equal((await c.post('/auth/register', data)).status, 202);
  const mail = outbox.at(-1);
  assert.equal((await c.post('/auth/verify-email', { token: tokenFromMail(mail) })).status, 200);
}

test('register -> blocked until verified -> verify -> login -> me', async () => {
  const c = client(app.url);
  assert.equal((await c.post('/auth/register', student())).status, 202);
  assert.equal(outbox.length, 1);
  const early = await c.login('stu@test.local', 'Student-Pass-123');
  assert.equal(early.status, 403);
  assert.equal(early.body.error.code, 'EMAIL_NOT_VERIFIED');

  await c.post('/auth/verify-email', { token: tokenFromMail(outbox[0]) });
  const ok = await c.login('stu@test.local', 'Student-Pass-123');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.user.role, 'STUDENT');
  const cookieHeader = ok.setCookie.join(';');
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Lax/i);
  assert.equal((await c.get('/auth/me')).body.data.user.email, 'stu@test.local');
});

test('session cookie is never stored in plaintext', async () => {
  const c = client(app.url);
  await registerAndVerify(c, student());
  await c.login('stu@test.local', 'Student-Pass-123');
  const raw = c.cookie.split('=')[1];
  const { rows } = await query('SELECT encode(id_hash,$1) AS h FROM auth_sessions', ['escape']);
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].h.includes(raw));
});

test('verification token is single use and expires', async () => {
  const c = client(app.url);
  await c.post('/auth/register', student());
  const t = tokenFromMail(outbox[0]);
  assert.equal((await c.post('/auth/verify-email', { token: t })).status, 200);
  assert.equal((await c.post('/auth/verify-email', { token: t })).status, 400);

  await c.post('/auth/register', student({ email: 'b@test.local', matricule: 'M-2' }));
  await query(`UPDATE auth_tokens SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL`);
  assert.equal((await c.post('/auth/verify-email', { token: tokenFromMail(outbox[1]) })).status, 400);
});

test('duplicate registration looks identical and sends no second mail', async () => {
  const c = client(app.url);
  const first = await c.post('/auth/register', student());
  const dupEmail = await c.post('/auth/register', student({ matricule: 'M-9' }));
  const dupMatricule = await c.post('/auth/register', student({ email: 'x@test.local' }));
  assert.deepEqual(dupEmail.body, first.body);
  assert.deepEqual(dupMatricule.body, first.body);
  assert.equal(outbox.length, 1);
});

test('mass assignment and role escalation are rejected', async () => {
  const c = client(app.url);
  assert.equal((await c.post('/auth/register', student({ role: 'ADMIN' }))).status, 400);
  assert.equal((await c.post('/auth/register', student({ status: 'ACTIVE' }))).status, 400);
  assert.equal((await c.post('/auth/register', student({ password: 'short' }))).status, 400);
  assert.equal((await query('SELECT 1 FROM users')).rowCount, 0);
});

test('wrong password and unknown email give the same error', async () => {
  const c = client(app.url);
  await registerAndVerify(c, student());
  const a = await c.login('stu@test.local', 'wrong-password-123');
  const b = await c.login('nobody@test.local', 'wrong-password-123');
  assert.equal(a.status, 401);
  assert.deepEqual(a.body, b.body);
});

test('SQL injection strings are inert', async () => {
  const c = client(app.url);
  assert.equal((await c.login("' OR 1=1 --", 'x')).status, 400);
  await createAdmin();
  await c.login('admin@test.local', 'Admin-Password-123');
  const r = await c.get(`/admin/users?q=${encodeURIComponent("'; DROP TABLE users;--")}`);
  assert.equal(r.status, 200);
  assert.equal((await query('SELECT 1 FROM users')).rowCount, 1);
});

test('CSRF: logout needs the token; foreign Origin is refused; logout kills the session', async () => {
  const c = client(app.url);
  await registerAndVerify(c, student());
  await c.login('stu@test.local', 'Student-Pass-123');
  assert.equal((await c.post('/auth/logout', {}, { noCsrf: true })).status, 403);
  assert.equal((await c.post('/auth/logout', {}, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await c.post('/auth/logout')).status, 200);
  assert.equal((await c.get('/auth/me')).status, 401);
});

test('RBAC: anonymous 401, student 403 on admin routes', async () => {
  const c = client(app.url);
  assert.equal((await c.get('/admin/users')).status, 401);
  await registerAndVerify(c, student());
  await c.login('stu@test.local', 'Student-Pass-123');
  assert.equal((await c.get('/admin/users')).status, 403);
  assert.equal((await c.post('/admin/professors/00000000-0000-0000-0000-000000000000/verify')).status, 403);
});

test('ban: revokes live sessions at once, blocks login with reason, unban restores, audited', async () => {
  const s = client(app.url);
  await registerAndVerify(s, student());
  await s.login('stu@test.local', 'Student-Pass-123');
  const id = (await s.get('/auth/me')).body.data.user.id;

  await createAdmin();
  const a = client(app.url);
  await a.login('admin@test.local', 'Admin-Password-123');
  const ban = await a.post(`/admin/users/${id}/suspend`, { reason: 'Cheating attempt' });
  assert.equal(ban.status, 200);

  assert.equal((await s.get('/auth/me')).status, 401);           // existing session dead immediately
  const denied = await client(app.url).login('stu@test.local', 'Student-Pass-123');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'ACCOUNT_SUSPENDED');
  assert.equal(denied.body.error.details.reason, 'Cheating attempt');

  assert.equal((await a.post(`/admin/users/${id}/unsuspend`)).status, 200);
  assert.equal((await client(app.url).login('stu@test.local', 'Student-Pass-123')).status, 200);

  const logs = await query(`SELECT action FROM activity_logs WHERE action LIKE 'USER_%SUSPENDED'`);
  assert.equal(logs.rowCount, 2);
});

test('admin cannot ban themselves or another admin', async () => {
  await createAdmin();
  await createAdmin('admin2@test.local');
  const a = client(app.url);
  await a.login('admin@test.local', 'Admin-Password-123');
  const me = (await a.get('/auth/me')).body.data.user.id;
  assert.equal((await a.post(`/admin/users/${me}/suspend`, { reason: 'oops' })).status, 400);
  const other = (await query(`SELECT id FROM users WHERE email='admin2@test.local'`)).rows[0].id;
  assert.equal((await a.post(`/admin/users/${other}/suspend`, { reason: 'nope' })).status, 403);
});

test('timed ban lifts itself after it expires', async () => {
  const s = client(app.url);
  await registerAndVerify(s, student());
  const id = (await query(`SELECT id FROM users WHERE email='stu@test.local'`)).rows[0].id;
  await query(`UPDATE users SET status='SUSPENDED', suspended_until = now() - interval '1 second' WHERE id=$1`, [id]);
  assert.equal((await s.login('stu@test.local', 'Student-Pass-123')).status, 200);
});

test('password reset: uniform response, single-use token, revokes sessions, new password works', async () => {
  const s = client(app.url);
  await registerAndVerify(s, student());
  await s.login('stu@test.local', 'Student-Pass-123');
  outbox.length = 0;

  const known = await client(app.url).post('/auth/forgot-password', { email: 'stu@test.local' });
  const unknown = await client(app.url).post('/auth/forgot-password', { email: 'ghost@test.local' });
  assert.deepEqual(known.body, unknown.body);
  assert.equal(outbox.length, 1);                                  // mail only for the real account

  const token = tokenFromMail(outbox[0]);
  const c = client(app.url);
  assert.equal((await c.post('/auth/reset-password', { token, password: 'Brand-New-Pass-456' })).status, 200);
  assert.equal((await c.post('/auth/reset-password', { token, password: 'Another-Pass-789' })).status, 400);
  assert.equal((await s.get('/auth/me')).status, 401);             // old session revoked
  assert.equal((await client(app.url).login('stu@test.local', 'Student-Pass-123')).status, 401);
  assert.equal((await client(app.url).login('stu@test.local', 'Brand-New-Pass-456')).status, 200);
});

test('login is rate limited per account', async () => {
  const c = client(app.url);
  await registerAndVerify(c, student());
  let last;
  for (let i = 0; i < 11; i++) last = await c.login('stu@test.local', `wrong-password-${i}`);
  assert.equal(last.status, 429);
  assert.equal((await c.login('stu@test.local', 'Student-Pass-123')).status, 429); // even the right password
});

test('professor registers without approval, can verify-badge by admin only', async () => {
  const p = client(app.url);
  await registerAndVerify(p, { role: 'PROFESSOR', email: 'prof@test.local', password: 'Professor-Pass-1',
    firstName: 'Omar', lastName: 'K' });
  assert.equal((await p.login('prof@test.local', 'Professor-Pass-1')).body.data.user.role, 'PROFESSOR');
  const id = (await p.get('/auth/me')).body.data.user.id;
  assert.equal((await p.post(`/admin/professors/${id}/verify`)).status, 403);
  await createAdmin();
  const a = client(app.url);
  await a.login('admin@test.local', 'Admin-Password-123');
  assert.equal((await a.post(`/admin/professors/${id}/verify`)).status, 200);
});
