-- Cover image uploaded by the submitter: key in the TOOL_IMAGES R2 bucket. On a tool it wins over
-- image_url (the site's own share image); the generated art is used only when both are NULL.
-- image_rights_at records when the submitter confirmed they may share the image.
ALTER TABLE submission ADD COLUMN image_key TEXT;
ALTER TABLE submission ADD COLUMN image_rights_at TEXT;
ALTER TABLE tool ADD COLUMN image_key TEXT;
