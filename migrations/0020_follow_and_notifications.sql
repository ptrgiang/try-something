-- Follows between accounts, and two new notification kinds: an approved product update for people who saved the
-- tool, and a new tool from someone you follow. SQLite can't change a CHECK, so the notification table is rebuilt
-- with the same columns plus update_id and tool_id; code from before this migration keeps working against it.
PRAGMA defer_foreign_keys = true;

CREATE TABLE notification_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('submission', 'comment_reply', 'tool_comment', 'tool_update', 'new_tool')),
  submission_id TEXT REFERENCES submission (id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comment (id) ON DELETE CASCADE,
  update_id TEXT REFERENCES tool_update (id) ON DELETE CASCADE,
  tool_id TEXT REFERENCES tool (id) ON DELETE CASCADE,
  -- The status a submission moved to, as it was when the notification was made.
  status TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
INSERT INTO notification_new (id, user_id, kind, submission_id, comment_id, status, created_at, read_at)
  SELECT id, user_id, kind, submission_id, comment_id, status, created_at, read_at FROM notification;
DROP TABLE notification;
ALTER TABLE notification_new RENAME TO notification;
CREATE INDEX IF NOT EXISTS notification_user_idx ON notification (user_id, created_at);
CREATE INDEX IF NOT EXISTS notification_created_idx ON notification (created_at);

-- Who follows whom. Private to each side for now: no public counts or lists until moderation covers them.
CREATE TABLE IF NOT EXISTS follow (
  follower_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follow_followee_idx ON follow (followee_id);
