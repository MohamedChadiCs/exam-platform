// Must be imported BEFORE any src/ module: it points the app at an isolated test database.
import pg from 'pg';
import argon2 from 'argon2';
import { migrate } from '../src/lib/migrate.js';

process.env.NODE_ENV = 'test';
const base = new URL(process.env.DATABASE_URL);
const TEST_DB = 'exam_platform_test';
const adminUrl = new URL(base); adminUrl.pathname = '/postgres';
const testUrl = new URL(base); testUrl.pathname = `/${TEST_DB}`;
process.env.DATABASE_URL = testUrl.toString();

const boot = new pg.Client({ connectionString: adminUrl.toString() });
await boot.connect();
const exists = await boot.query('SELECT 1 FROM pg_database WHERE datname=$1', [TEST_DB]);
if (!exists.rowCount) await boot.query(`CREATE DATABASE ${TEST_DB}`);
await boot.end();
await migrate(testUrl.toString());

const { pool, query } = await import('../src/lib/db.js');
const { createApp } = await import('../src/app.js');
const { outbox } = await import('../src/lib/mailer.js');
export { pool, query, outbox };

export async function resetDb() {
  // roles are reference data and stay; everything else is wiped (TRUNCATE does not fire the append-only triggers)
  await query(`TRUNCATE users, departments, question_types, system_settings RESTART IDENTITY CASCADE`);
  outbox.length = 0;
}

export async function startApp() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

/** Tiny HTTP client with a cookie jar and automatic CSRF header. */
export function client(baseUrl) {
  let cookie = '';
  let csrf = '';
  const api = {
    get cookie() { return cookie; },
    set csrf(v) { csrf = v; },
    async call(method, path, body, { headers = {}, noCsrf = false } = {}) {
      const res = await fetch(baseUrl + '/api/v1' + path, {
        method,
        headers: {
          ...(body !== undefined && { 'content-type': 'application/json' }),
          ...(cookie && { cookie }),
          ...(csrf && !noCsrf && { 'x-csrf-token': csrf }),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie?.() ?? [];
      for (const c of set) {
        const [pair] = c.split(';');
        cookie = /=\s*$/.test(pair) ? '' : pair;
      }
      const json = await res.json().catch(() => null);
      return { status: res.status, body: json, setCookie: set };
    },
    get: (p, o) => api.call('GET', p, undefined, o),
    post: (p, b = {}, o) => api.call('POST', p, b, o),
    async login(email, password) {
      const r = await api.post('/auth/login', { email, password });
      if (r.status === 200) csrf = r.body.data.csrfToken;
      return r;
    },
  };
  return api;
}

export async function createAdmin(email = 'admin@test.local', password = 'Admin-Password-123') {
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await query(
    `INSERT INTO users(email,password_hash,role_id,status,first_name,last_name,email_verified_at)
     VALUES ($1,$2,1,'ACTIVE','Ad','Min',now())`, [email, hash]);
  return { email, password };
}

export const tokenFromMail = (m) => m.text.match(/token=([\w-]+)/)[1];
