// Counters pile up across local runs and push seeded tools out of top-N lists ("Top today", top pages),
// so each run starts them from zero. Only the LOCAL database; a deployed site is never touched.
import { sql } from "./helpers";

const TABLES = [
  "tool_stat_daily",
  "surface_stat_daily",
  "funnel_source_daily",
  "funnel_surface_daily",
  "visit_day",
  "page_stat_daily",
  "source_stat_daily",
  "country_stat_daily",
  "site_stat_daily",
  "search_stat_daily",
  "user_active_day",
  "app_rate_limit",
];

export default function globalSetup() {
  if (process.env.E2E_BASE_URL) return;
  sql(TABLES.map((t) => `DELETE FROM ${t};`).join(" "));
}
