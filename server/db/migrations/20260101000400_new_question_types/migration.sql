-- Migration to add support for new question types
INSERT INTO question_types (code) VALUES
  ('MCQ_SINGLE'),
  ('MCQ_MULTI'),
  ('TRUE_FALSE'),
  ('NUMERIC'),
  ('SHORT_TEXT'),
  ('LONG_TEXT'),
  ('ESSAY'),
  ('FILL_BLANK'),
  ('MATCHING'),
  ('ORDERING'),
  ('CODE')
ON CONFLICT (code) DO NOTHING;
