-- One person, one account: emails are stored lowercased, and this keeps a differently-cased copy from
-- ever creating a second user. Safe to add: existing rows are already unique case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS user_email_lower_idx ON "user" (lower("email"));
