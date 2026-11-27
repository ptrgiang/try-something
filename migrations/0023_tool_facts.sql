-- Facts an editor checked on the tool's own site: what it costs, whether it needs an account, where its code is.
-- Empty means not checked, and the page says nothing about it. facts_checked_at is when they were last confirmed.
ALTER TABLE tool ADD COLUMN price TEXT NOT NULL DEFAULT '' CHECK (price IN ('', 'free', 'freemium', 'paid'));
ALTER TABLE tool ADD COLUMN account TEXT NOT NULL DEFAULT '' CHECK (account IN ('', 'none', 'optional', 'required'));
ALTER TABLE tool ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE tool ADD COLUMN facts_checked_at TEXT;
