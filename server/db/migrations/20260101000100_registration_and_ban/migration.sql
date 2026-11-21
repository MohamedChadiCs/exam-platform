ALTER TABLE users ALTER COLUMN email TYPE text;
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
DROP EXTENSION IF EXISTS citext;

ALTER TABLE auth_sessions        ALTER COLUMN ip TYPE text USING ip::text;
ALTER TABLE exam_sessions        ALTER COLUMN ip TYPE text USING ip::text;
ALTER TABLE access_code_attempts ALTER COLUMN ip TYPE text USING ip::text;
ALTER TABLE security_events      ALTER COLUMN ip TYPE text USING ip::text;
ALTER TABLE activity_logs        ALTER COLUMN ip TYPE text USING ip::text;

ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('PENDING_EMAIL','ACTIVE','SUSPENDED','ARCHIVED'));
ALTER TABLE users DROP COLUMN approved_by, DROP COLUMN approved_at;

ALTER TABLE users
  ADD COLUMN suspended_at      timestamptz,
  ADD COLUMN suspended_by      uuid REFERENCES users(id),
  ADD COLUMN suspension_reason text,
  ADD COLUMN suspended_until   timestamptz;

ALTER TABLE professors
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid REFERENCES users(id);
