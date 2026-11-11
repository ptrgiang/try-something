-- People's own lists of tools. Private by default; a public list gets a page under its owner's profile.
-- The slug is fixed when the list is made, so a shared link keeps working after a rename.
CREATE TABLE IF NOT EXISTS user_list (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS user_list_item (
  list_id TEXT NOT NULL REFERENCES user_list (id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (list_id, tool_id)
);
CREATE INDEX IF NOT EXISTS user_list_item_tool_idx ON user_list_item (tool_id);
