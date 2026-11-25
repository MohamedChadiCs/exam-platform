-- Add title column to question_versions
ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS title text;

-- question_attachments: stores uploaded media for questions (images, audio, video)
CREATE TABLE IF NOT EXISTS question_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id uuid REFERENCES question_versions(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL REFERENCES users(id),
  filename      text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  data          bytea NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qatt_qv ON question_attachments(question_version_id);
CREATE INDEX IF NOT EXISTS idx_qatt_owner ON question_attachments(owner_id);
