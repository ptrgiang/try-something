-- Try Something initial schema.
-- Auth tables follow Better Auth's core schema (user, session, account, verification, rateLimit).
-- Dates written by Better Auth are stored as ISO strings; app tables use ISO strings too.

CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  -- App fields. role is never writable from client input (input:false in auth config).
  "role" TEXT NOT NULL DEFAULT 'user' CHECK ("role" IN ('user', 'moderator', 'admin')),
  "handle" TEXT UNIQUE
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX "session_userId_idx" ON "session" ("userId");

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE UNIQUE INDEX "account_provider_idx" ON "account" ("providerId", "accountId");

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE "rateLimit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" INTEGER NOT NULL
);

-- Published catalog. Only rows with status = 'published' are public.
CREATE TABLE tool (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_key TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL,
  try_this TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  maker_name TEXT,
  maker_url TEXT,
  -- Original cover art preset; never a third-party screenshot.
  art TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  featured INTEGER NOT NULL DEFAULT 0,
  submission_id TEXT,
  submitted_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  credit_type TEXT CHECK (credit_type IN ('made', 'found', 'editorial')),
  hidden_reason TEXT,
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX tool_status_published_idx ON tool (status, published_at DESC);
CREATE INDEX tool_category_idx ON tool (status, category);

CREATE TABLE submission (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('made', 'found')),
  url TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  try_this TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  maker_name TEXT,
  maker_url TEXT,
  -- Raw metadata suggestion captured at submit time, shown to moderators as untrusted source data.
  source_meta TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'needs_changes', 'published', 'rejected', 'withdrawn')),
  moderator_note TEXT,
  tool_id TEXT REFERENCES tool (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX submission_user_idx ON submission (user_id, created_at DESC);
CREATE INDEX submission_status_idx ON submission (status, created_at);
-- At most one open submission per canonical URL.
CREATE UNIQUE INDEX submission_open_canonical_idx ON submission (canonical_key)
  WHERE status IN ('pending', 'in_review', 'needs_changes');

-- Append-only moderation history.
CREATE TABLE moderation_event (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT REFERENCES submission (id) ON DELETE CASCADE,
  tool_id TEXT REFERENCES tool (id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES "user" ("id") ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX moderation_event_submission_idx ON moderation_event (submission_id, created_at);
CREATE INDEX moderation_event_tool_idx ON moderation_event (tool_id, created_at);

CREATE TABLE bookmark (
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, tool_id)
);

CREATE TABLE collection (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE collection_tool (
  collection_id TEXT NOT NULL REFERENCES collection (id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  PRIMARY KEY (collection_id, tool_id)
);

-- Fixed-window counters for app-level rate limits (submissions, metadata fetches).
CREATE TABLE app_rate_limit (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
