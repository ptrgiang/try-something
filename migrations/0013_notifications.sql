-- In-site notifications. Rows point at the submission or comment instead of copying its text, so a comment
-- that is later hidden or deleted drops out of the list. Kept 90 days.
CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('submission', 'comment_reply', 'tool_comment')),
  submission_id TEXT REFERENCES submission (id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comment (id) ON DELETE CASCADE,
  -- The status a submission moved to, as it was when the notification was made.
  status TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS notification_user_idx ON notification (user_id, created_at);
CREATE INDEX IF NOT EXISTS notification_created_idx ON notification (created_at);
