-- Daily aggregate of "Try it" clicks per tool. No user or IP data is stored here;
-- per-visitor de-duplication uses hashed keys in app_rate_limit.
CREATE TABLE tool_stat_daily (
  tool_id TEXT NOT NULL REFERENCES tool (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tool_id, day)
);
CREATE INDEX tool_stat_daily_day_idx ON tool_stat_daily (day);
CREATE INDEX bookmark_tool_idx ON bookmark (tool_id, created_at);
