-- Moderation for people's lists, and per-kind notification opt-outs.
-- SQLite can't change a CHECK, so the report table is rebuilt to accept 'list' targets; the columns are unchanged,
-- so code from before this migration keeps working against it.
PRAGMA defer_foreign_keys = true;

CREATE TABLE report_new (
  id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('tool', 'comment', 'list')),
  target_id TEXT NOT NULL,
  reporter_id TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'misleading', 'broken', 'other')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  resolution TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
INSERT INTO report_new SELECT id, target_type, target_id, reporter_id, reason, note, status, resolved_by, resolution, created_at, resolved_at FROM report;
DROP TABLE report;
ALTER TABLE report_new RENAME TO report;
CREATE INDEX IF NOT EXISTS report_status_idx ON report (status, created_at);
CREATE INDEX IF NOT EXISTS report_target_idx ON report (target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS report_open_once_idx ON report (target_type, target_id, reporter_id) WHERE status = 'open';

-- A moderator (or enough reports) can hide a public list. Its owner still sees it; nobody else does.
ALTER TABLE user_list ADD COLUMN hidden_at TEXT;
ALTER TABLE user_list ADD COLUMN hidden_reason TEXT;
ALTER TABLE moderation_event ADD COLUMN list_id TEXT REFERENCES user_list (id) ON DELETE SET NULL;

-- Notification kinds a person turned off. Everything is on until they do; submission status changes can't be muted.
CREATE TABLE IF NOT EXISTS notification_mute (
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('comment_reply', 'tool_comment', 'tool_update', 'new_tool')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);
