-- Product updates from makers on their published tools. A moderator applies the new text or declines it;
-- only a moderator can also resurface the tool in Picks, and not again within the cooldown (lib/moderation.ts).
CREATE TABLE IF NOT EXISTS tool_update (
  id TEXT PRIMARY KEY NOT NULL,
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  -- What changed, in the maker's words; shown on the tool page once approved.
  note TEXT NOT NULL,
  tagline TEXT NOT NULL,
  try_this TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected', 'withdrawn')),
  resurfaced INTEGER NOT NULL DEFAULT 0,
  moderator_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS tool_update_tool_idx ON tool_update (tool_id, created_at);
CREATE INDEX IF NOT EXISTS tool_update_status_idx ON tool_update (status, created_at);
-- One update waiting per tool.
CREATE UNIQUE INDEX IF NOT EXISTS tool_update_one_pending ON tool_update (tool_id) WHERE status = 'pending';

-- When a moderator last resurfaced the tool for a meaningful update (Picks treats it like a new tool).
ALTER TABLE tool ADD COLUMN refreshed_at TEXT;
ALTER TABLE moderation_event ADD COLUMN update_id TEXT REFERENCES tool_update (id) ON DELETE SET NULL;
