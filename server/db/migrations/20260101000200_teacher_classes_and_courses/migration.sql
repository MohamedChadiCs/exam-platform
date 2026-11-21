-- Add owner and invite_code to academic_classes
ALTER TABLE academic_classes ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id);
ALTER TABLE academic_classes ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;
ALTER TABLE academic_classes ALTER COLUMN department_id DROP NOT NULL;
ALTER TABLE academic_classes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Add owner to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id);
ALTER TABLE courses ALTER COLUMN department_id DROP NOT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Class to Course mapping
CREATE TABLE IF NOT EXISTS class_courses (
  class_id uuid NOT NULL REFERENCES academic_classes(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, course_id)
);

-- Class to Student mapping (enrollments)
CREATE TABLE IF NOT EXISTS class_students (
  class_id uuid NOT NULL REFERENCES academic_classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);

-- Generate invite codes for any existing classes
UPDATE academic_classes
   SET invite_code = 'CLS-' || UPPER(SUBSTRING(MD5(id::text || name) FROM 1 FOR 6))
 WHERE invite_code IS NULL;
