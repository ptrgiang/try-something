-- Hearts (signed-in users, one per user per tool) and daily tool page views.
-- Views are counted like tries: once per visitor per tool per day, from a daily-rotating salted IP hash.
ALTER TABLE tool_stat_daily ADD COLUMN views INTEGER NOT NULL DEFAULT 0;

CREATE TABLE tool_like (
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, tool_id)
);
CREATE INDEX tool_like_tool_idx ON tool_like (tool_id, created_at);
