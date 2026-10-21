-- Editor-written intro for a tag page (/tags/<tag>). Plain text, rendered escaped.
CREATE TABLE tag_info (
  tag TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL
);
