-- Add verified_at and verified_by to students for administrator approval
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users(id);
