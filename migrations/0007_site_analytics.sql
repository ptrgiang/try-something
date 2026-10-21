-- Site-wide daily aggregates for /admin/stats. Only totals are stored: no IP, cookie, user agent or URL query.
-- Visitors are de-duplicated with the same daily-rotating salted IP hash as tool views (in app_rate_limit).
CREATE TABLE site_stat_daily (
  day TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  mobile_visitors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE page_stat_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

-- Where each visitor's first page of the day came from: a referring host, a utm_source/ref tag, or "direct".
CREATE TABLE source_stat_daily (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source)
);

CREATE TABLE country_stat_daily (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country)
);

-- One row per account per active day, for weekly retention. Goes with the account; pruned after 180 days.
CREATE TABLE user_active_day (
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX user_active_day_day_idx ON user_active_day (day);
