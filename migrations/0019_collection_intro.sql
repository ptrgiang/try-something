-- A few editor-written paragraphs under a collection's one-line description, for pages that answer a
-- search ("Websites like …"). Plain text; a blank line starts a new paragraph. Empty means none.
ALTER TABLE collection ADD COLUMN intro TEXT NOT NULL DEFAULT '';
