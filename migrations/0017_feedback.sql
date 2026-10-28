-- Feedback sent from the site (/feedback), read by moderators at /admin/feedback. No email or IP is stored:
-- user_id is set only when the sender was signed in, so a reply is possible.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'tool', 'idea', 'other')),
  message TEXT NOT NULL,
  page TEXT,
  user_id TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  created_at TEXT NOT NULL,
  handled_at TEXT,
  handled_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback (status, created_at DESC);
