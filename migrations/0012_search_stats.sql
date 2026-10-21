-- Daily counts of searches run on /explore, per normalized term. Each visitor counts once per term per day.
CREATE TABLE IF NOT EXISTS search_stat_daily (
  day TEXT NOT NULL,
  term TEXT NOT NULL,
  searches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, term)
);
