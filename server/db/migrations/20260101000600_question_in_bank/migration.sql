-- Distinguish Question Bank questions from exam-only inline questions
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS in_bank boolean NOT NULL DEFAULT true;
