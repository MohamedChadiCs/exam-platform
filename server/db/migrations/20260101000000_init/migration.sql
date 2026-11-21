CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE roles (
  id smallint PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code IN ('ADMIN','PROFESSOR','STUDENT'))
);
INSERT INTO roles VALUES (1,'ADMIN'),(2,'PROFESSOR'),(3,'STUDENT');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role_id smallint NOT NULL REFERENCES roles(id),
  status text NOT NULL DEFAULT 'PENDING_EMAIL'
    CHECK (status IN ('PENDING_EMAIL','PENDING_APPROVAL','ACTIVE','SUSPENDED','ARCHIVED')),
  first_name text NOT NULL,
  last_name  text NOT NULL,
  locale text NOT NULL DEFAULT 'fr' CHECK (locale IN ('ar','fr','en')),
  email_verified_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id_hash bytea PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip inet, user_agent text
);
CREATE INDEX ON auth_sessions(user_id);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD')),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  archived_at timestamptz
);
CREATE TABLE academic_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id),
  name text NOT NULL,
  academic_year text NOT NULL,
  archived_at timestamptz,
  UNIQUE (department_id, name, academic_year)
);
CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id),
  code text NOT NULL,
  name text NOT NULL,
  archived_at timestamptz,
  UNIQUE (department_id, code)
);
CREATE TABLE students (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  matricule text NOT NULL UNIQUE,
  class_id uuid REFERENCES academic_classes(id)
);
CREATE TABLE professors (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  department_id uuid REFERENCES departments(id),
  title text
);
CREATE TABLE course_professors (
  course_id uuid REFERENCES courses(id),
  professor_id uuid REFERENCES professors(user_id),
  PRIMARY KEY (course_id, professor_id)
);

CREATE TABLE question_types (
  code text PRIMARY KEY
);
CREATE TABLE question_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES professors(user_id),
  parent_id uuid REFERENCES question_categories(id),
  name text NOT NULL
);
CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  storage_key text NOT NULL UNIQUE,
  mime text NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
  bytes integer NOT NULL CHECK (bytes > 0),
  sha256 bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES professors(user_id),
  category_id uuid REFERENCES question_categories(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id),
  version integer NOT NULL CHECK (version > 0),
  type_code text NOT NULL REFERENCES question_types(code),
  locale text NOT NULL CHECK (locale IN ('ar','fr','en')),
  body_md text NOT NULL,
  explanation_md text,
  default_points numeric(6,2) NOT NULL CHECK (default_points >= 0),
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, version)
);
CREATE TABLE answer_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id uuid NOT NULL REFERENCES question_versions(id),
  position smallint NOT NULL,
  body_md text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  feedback_md text,
  UNIQUE (question_version_id, position)
);

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  owner_id uuid NOT NULL REFERENCES professors(user_id),
  title text NOT NULL,
  description_md text,
  locale text NOT NULL CHECK (locale IN ('ar','fr','en')),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PUBLISHED','CANCELLED','CLOSED','ARCHIVED')),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  max_score numeric(7,2) NOT NULL CHECK (max_score > 0),
  passing_score numeric(7,2) NOT NULL,
  shuffle_questions boolean NOT NULL DEFAULT true,
  shuffle_options boolean NOT NULL DEFAULT true,
  negative_marking boolean NOT NULL DEFAULT false,
  max_attempts smallint NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  results_policy text NOT NULL DEFAULT 'MANUAL'
    CHECK (results_policy IN ('MANUAL','AFTER_CLOSE','IMMEDIATE')),
  show_feedback boolean NOT NULL DEFAULT false,
  monitor_focus boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_at < closes_at),
  CHECK (passing_score BETWEEN 0 AND max_score)
);
CREATE INDEX ON exams(owner_id, status);

CREATE TABLE exam_questions (
  exam_id uuid NOT NULL REFERENCES exams(id),
  question_version_id uuid NOT NULL REFERENCES question_versions(id),
  position integer NOT NULL,
  points numeric(6,2) NOT NULL CHECK (points >= 0),
  PRIMARY KEY (exam_id, question_version_id)
);
CREATE TABLE exam_question_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id),
  category_id uuid NOT NULL REFERENCES question_categories(id),
  draw_count integer NOT NULL CHECK (draw_count > 0),
  points_each numeric(6,2) NOT NULL CHECK (points_each >= 0)
);

CREATE TABLE access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id),
  created_by uuid NOT NULL REFERENCES professors(user_id),
  code_hash bytea NOT NULL UNIQUE,
  qr_token_hash bytea NOT NULL UNIQUE,
  code_enc bytea NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','REVOKED','EXPIRED','EXHAUSTED')),
  expires_at timestamptz NOT NULL,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  requires_approval boolean NOT NULL DEFAULT false,
  eligible_class_id uuid REFERENCES academic_classes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  CHECK (max_uses IS NULL OR used_count <= max_uses)
);
CREATE INDEX ON access_codes(exam_id, status);

CREATE TABLE access_code_attempts (
  id bigserial PRIMARY KEY,
  access_code_id uuid REFERENCES access_codes(id),
  user_id uuid NOT NULL REFERENCES users(id),
  ip inet NOT NULL,
  outcome text NOT NULL CHECK (outcome IN
    ('SUCCESS','NOT_FOUND','EXPIRED','REVOKED','EXHAUSTED','INELIGIBLE','ALREADY_ENROLLED','RATE_LIMITED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON access_code_attempts(user_id, created_at);
CREATE INDEX ON access_code_attempts(ip, created_at);

CREATE TABLE exam_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id),
  student_id uuid NOT NULL REFERENCES students(user_id),
  access_code_id uuid REFERENCES access_codes(id),
  status text NOT NULL CHECK (status IN ('PENDING','ENROLLED','REJECTED','REMOVED')),
  decided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES exam_enrollments(id),
  attempt_no smallint NOT NULL CHECK (attempt_no >= 1),
  status text NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS','SUBMITTED','AUTO_SUBMITTED','VOIDED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  ip inet, user_agent text,
  UNIQUE (enrollment_id, attempt_no),
  CHECK (deadline_at > started_at)
);
CREATE UNIQUE INDEX one_active_session_per_enrollment
  ON exam_sessions(enrollment_id) WHERE status = 'IN_PROGRESS';
CREATE INDEX ON exam_sessions(deadline_at) WHERE status = 'IN_PROGRESS';

CREATE TABLE session_questions (
  session_id uuid NOT NULL REFERENCES exam_sessions(id),
  position integer NOT NULL,
  question_version_id uuid NOT NULL REFERENCES question_versions(id),
  points numeric(6,2) NOT NULL,
  option_order uuid[],
  PRIMARY KEY (session_id, position),
  UNIQUE (session_id, question_version_id)
);
CREATE TABLE student_answers (
  session_id uuid NOT NULL REFERENCES exam_sessions(id),
  question_version_id uuid NOT NULL REFERENCES question_versions(id),
  answer jsonb NOT NULL,
  seq bigint NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, question_version_id)
);

CREATE TABLE grades (
  session_id uuid NOT NULL REFERENCES exam_sessions(id),
  question_version_id uuid NOT NULL REFERENCES question_versions(id),
  auto_score numeric(6,2),
  manual_score numeric(6,2),
  final_score numeric(6,2) NOT NULL DEFAULT 0,
  needs_manual boolean NOT NULL DEFAULT false,
  PRIMARY KEY (session_id, question_version_id)
);
CREATE TABLE manual_corrections (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL,
  question_version_id uuid NOT NULL,
  grader_id uuid NOT NULL REFERENCES professors(user_id),
  previous_score numeric(6,2), new_score numeric(6,2) NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, question_version_id) REFERENCES grades(session_id, question_version_id)
);
CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES exam_sessions(id),
  total_score numeric(7,2), percentage numeric(5,2), passed boolean,
  results_published_at timestamptz,
  published_by uuid REFERENCES professors(user_id)
);

CREATE TABLE security_events (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES exam_sessions(id),
  user_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO','NOTICE','WARNING')),
  details jsonb NOT NULL DEFAULT '{}',
  ip inet,
  client_ts timestamptz, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON security_events(session_id, received_at);

CREATE TABLE activity_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL, entity_id text,
  before jsonb, after jsonb,
  ip inet, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications(user_id, read_at);
CREATE TABLE system_settings (
  key text PRIMARY KEY, value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER t_immutable BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER t_immutable BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER t_immutable BEFORE UPDATE OR DELETE ON access_code_attempts
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER t_immutable BEFORE UPDATE OR DELETE ON manual_corrections
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
