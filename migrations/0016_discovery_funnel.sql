-- Visitor-day funnel (page load → saw a card or opened a tool → clicked Try) by source and by surface.
-- Existing daily tables are left as they are; the funnel only counts from the day this ships.

-- Today's state per visitor, so each funnel step counts a visitor once. The key is the same daily-rotating salted
-- IP hash used for de-duplication in app_rate_limit; rows are deleted after two days. No IP, user agent or account.
CREATE TABLE IF NOT EXISTS visit_day (
  visitor TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  engaged INTEGER NOT NULL DEFAULT 0,
  tried INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visit_day_day_idx ON visit_day (day);

-- Visitor-days per acquisition source: visits (a counted page load), engaged, tried. medium and campaign are the
-- utm_ values when given, '' otherwise; source is utm_source/ref, else the referring host, else 'direct'.
CREATE TABLE IF NOT EXISTS funnel_source_daily (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  visits INTEGER NOT NULL DEFAULT 0,
  engaged INTEGER NOT NULL DEFAULT 0,
  tried INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source, medium, campaign)
);

-- Visitor-days that engaged with (saw a card on, or opened a tool from) each surface, and that clicked Try from it.
CREATE TABLE IF NOT EXISTS funnel_surface_daily (
  day TEXT NOT NULL,
  surface TEXT NOT NULL,
  engaged INTEGER NOT NULL DEFAULT 0,
  tried INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, surface)
);
