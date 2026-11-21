-- Rename owner_id to teacher_id on academic_classes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'academic_classes' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE academic_classes RENAME COLUMN owner_id TO teacher_id;
  END IF;
END $$;

-- Rename owner_id to teacher_id on courses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'courses' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE courses RENAME COLUMN owner_id TO teacher_id;
  END IF;
END $$;

-- Migrate any students.class_id to class_students, then drop redundant class_id from students
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'class_id'
  ) THEN
    INSERT INTO class_students (class_id, student_id)
    SELECT class_id, user_id FROM students WHERE class_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE students DROP COLUMN class_id;
  END IF;
END $$;
