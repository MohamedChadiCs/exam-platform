import pg from 'pg';
import argon2 from 'argon2';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const isProd = process.env.NODE_ENV === 'production';

const QUESTION_TYPES = ['MCQ_SINGLE','MCQ_MULTI','TRUE_FALSE','NUMERIC','SHORT_TEXT','LONG_TEXT','FILL_BLANK','MATCHING','ORDERING'];
const SETTINGS = {
  'registration.open': true,
  'password.min_length': 10,
  'session.idle_minutes': 120,
  'session.absolute_hours': 12,
  'codes.default_ttl_hours': 24,
  'codes.max_failed_per_user_per_15min': 5,
  'codes.max_failed_per_ip_per_15min': 30,
  'codes.max_failed_global_per_15min': 300,
  'integrity.default_monitor_focus': true,
};

await db.connect();
try {
  for (const code of QUESTION_TYPES) {
    await db.query('INSERT INTO question_types(code) VALUES ($1) ON CONFLICT DO NOTHING', [code]);
  }
  for (const [key, value] of Object.entries(SETTINGS)) {
    await db.query('INSERT INTO system_settings(key,value) VALUES ($1,$2) ON CONFLICT DO NOTHING', [key, JSON.stringify(value)]);
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters in .env');
  }
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  // DO NOTHING: re-running never overwrites an existing admin's password
  await db.query(
    `INSERT INTO users(email,password_hash,role_id,status,first_name,last_name,locale,email_verified_at)
     VALUES ($1,$2,1,'ACTIVE','System','Administrator','fr',now())
     ON CONFLICT (lower(email)) DO NOTHING`, [email, hash]);
  console.log(`Admin ready: ${email}`);

  if (!isProd) {
    await db.query(`INSERT INTO departments(code,name) VALUES ('CS','Computer Science') ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO academic_classes(department_id,name,academic_year)
      SELECT id,'L3','2026/2027' FROM departments WHERE code='CS' ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO courses(department_id,code,name)
      SELECT id,'WEB301','Web Development' FROM departments WHERE code='CS' ON CONFLICT DO NOTHING`);
    console.log('Dev academic data ready (CS / L3 / WEB301)');
  }
} finally {
  await db.end();
}
