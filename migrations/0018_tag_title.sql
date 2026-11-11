-- An editor-written heading for a tag page ("Online drawing tools and games" for #drawing).
-- Empty means the page falls back to a heading built from the tag itself.
ALTER TABLE tag_info ADD COLUMN title TEXT NOT NULL DEFAULT '';
