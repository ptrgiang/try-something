-- M1 community: public profiles, comments, reports, and audit targets for them.

-- A profile page exists only once a user picks a handle; nothing here is public before that.
ALTER TABLE "user" ADD COLUMN bio TEXT;
ALTER TABLE "user" ADD COLUMN website TEXT;
ALTER TABLE "user" ADD COLUMN handle_changed_at TEXT;

-- Plain text only, rendered escaped. One level of replies (parent_id points at a top-level comment).
-- Authors delete by blanking the body (status 'deleted') so replies keep their context.
CREATE TABLE comment (
  id TEXT PRIMARY KEY NOT NULL,
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  parent_id TEXT REFERENCES comment (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  hidden_reason TEXT,
  created_at TEXT NOT NULL,
  edited_at TEXT
);
CREATE INDEX comment_tool_idx ON comment (tool_id, created_at);
CREATE INDEX comment_user_idx ON comment (user_id, created_at);
CREATE INDEX comment_parent_idx ON comment (parent_id);

CREATE TABLE report (
  id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('tool', 'comment')),
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
CREATE INDEX report_status_idx ON report (status, created_at);
CREATE INDEX report_target_idx ON report (target_type, target_id);
CREATE UNIQUE INDEX report_open_once_idx ON report (target_type, target_id, reporter_id) WHERE status = 'open';

-- Audit rows for comment moderation, role changes and collection edits.
ALTER TABLE moderation_event ADD COLUMN comment_id TEXT REFERENCES comment (id) ON DELETE SET NULL;
ALTER TABLE moderation_event ADD COLUMN subject_user_id TEXT REFERENCES "user" ("id") ON DELETE SET NULL;
ALTER TABLE moderation_event ADD COLUMN collection_id TEXT REFERENCES collection (id) ON DELETE SET NULL;
