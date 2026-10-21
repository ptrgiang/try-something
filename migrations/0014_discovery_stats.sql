-- Where tools are found: daily totals per discovery surface (hero, picks, home, explore, search, tag,
-- collection:<slug>, related, ...) and tool. Impressions are cards actually seen on screen; views and tries
-- are only counted here after tool_stat_daily's per-visitor de-duplication accepts them. No visitor data.
CREATE TABLE IF NOT EXISTS surface_stat_daily (
  day TEXT NOT NULL,
  surface TEXT NOT NULL,
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  impressions INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, surface, tool_id)
);
CREATE INDEX IF NOT EXISTS surface_stat_daily_tool_idx ON surface_stat_daily (tool_id, day);

-- Visitors who clicked through to at least one tool that day (the north-star count, per day).
ALTER TABLE site_stat_daily ADD COLUMN tryers INTEGER NOT NULL DEFAULT 0;
