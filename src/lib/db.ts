// D1 queries. Every public query filters on status = 'published'.

import type { SubmissionInput, ToolUpdateInput } from "./validation";
import { AUTO_HIDE_REPORTS, RESURFACE_COOLDOWN_DAYS, UPDATE_WINDOW_DAYS, type CommentStatus, type SubmissionStatus } from "./moderation";
import { NOTIFY_STATUSES, type NotificationRow } from "./notifications";
import { picksOrder, type PicksInput } from "./picks";
import type { Acquisition } from "./analytics";
import type { FeedbackInput, FeedbackKind } from "./feedback";
import { newId, nowIso } from "./util";
import { parseTags, slugify } from "./validation";

export interface ToolArt {
  palette?: string[];
  motif?: "blobs" | "waves" | "grid" | "sparks" | "stack";
}

export interface Tool {
  id: string;
  slug: string;
  name: string;
  url: string;
  canonical_key: string;
  tagline: string;
  try_this: string;
  why: string;
  category: string;
  tags: string[];
  maker_name: string | null;
  maker_url: string | null;
  image_url: string | null;
  image_key: string | null;
  art: ToolArt;
  status: "published" | "hidden";
  featured: number;
  submission_id: string | null;
  submitted_by: string | null;
  credit_type: "made" | "found" | "editorial" | null;
  hidden_reason: string | null;
  maker_verified_at: string | null;
  published_at: string;
  updated_at: string;
  /** Set when a moderator resurfaces the tool for a meaningful update. */
  refreshed_at: string | null;
}

export interface ToolWithCredit extends Tool {
  submitter_name: string | null;
  submitter_handle: string | null;
  /** All-time totals shown on cards: de-duplicated page views, hearts and account saves. */
  view_count: number;
  like_count: number;
  save_count: number;
}

export interface Submission {
  id: string;
  user_id: string;
  origin: "made" | "found";
  url: string;
  canonical_key: string;
  name: string;
  tagline: string;
  try_this: string;
  why: string;
  category: string;
  tags: string[];
  maker_name: string | null;
  maker_url: string | null;
  image_url: string | null;
  image_key: string | null;
  image_rights_at: string | null;
  source_meta: Record<string, unknown>;
  status: SubmissionStatus;
  moderator_note: string | null;
  tool_id: string | null;
  created_at: string;
  updated_at: string;
}

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toTool(row: Row): ToolWithCredit {
  return {
    ...(row as unknown as ToolWithCredit),
    tags: parseJson<string[]>(row.tags, []),
    art: parseJson<ToolArt>(row.art, {}),
    submitter_name: (row.submitter_name as string) ?? null,
    submitter_handle: (row.submitter_handle as string) ?? null,
    view_count: Number(row.view_count ?? 0),
    like_count: Number(row.like_count ?? 0),
    save_count: Number(row.save_count ?? 0),
  };
}

export function toSubmission(row: Row): Submission {
  return {
    ...(row as unknown as Submission),
    tags: parseJson<string[]>(row.tags, []),
    source_meta: parseJson<Record<string, unknown>>(row.source_meta, {}),
  };
}

const TOOL_SELECT = `SELECT t.*, u.name AS submitter_name, u.handle AS submitter_handle,
    COALESCE((SELECT SUM(d.views) FROM tool_stat_daily d WHERE d.tool_id = t.id), 0) AS view_count,
    (SELECT COUNT(*) FROM tool_like l WHERE l.tool_id = t.id) AS like_count,
    (SELECT COUNT(*) FROM bookmark b WHERE b.tool_id = t.id) AS save_count
  FROM tool t LEFT JOIN "user" u ON u.id = t.submitted_by`;

export type SortKey = "picks" | "new" | "trending" | "popular";

/** The sort in a list URL; no or unknown value means the default Picks order. */
export function parseSort(raw: string | null): SortKey {
  return raw === "new" || raw === "trending" || raw === "popular" ? raw : "picks";
}
/** Timeframe for Popular; Trending is always the last 7 days. */
export type Period = "month" | "year" | "all";
export const PERIODS: { id: Period; label: string; days: number | null }[] = [
  { id: "month", label: "Past month", days: 30 },
  { id: "year", label: "Past year", days: 365 },
  { id: "all", label: "All time", days: null },
];

// One engagement score for every ranking, counted over the last `days` (null = all time).
// Weights: a view is passive (1), a Try click opened the tool (3), a heart or an account save is a
// deliberate signed-in choice (5). All inputs are real, de-duplicated signals; with no data yet every
// ranking falls back to newest first, the same order as New.
export const SCORE_WEIGHTS = { view: 1, try: 3, like: 5, save: 5 } as const;
function scoreSql(days: number | null): string {
  const day = days ? ` AND d.day >= date('now', '-${days - 1} days')` : "";
  const since = (col: string) => (days ? ` AND ${col} >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${days} days')` : "");
  const w = SCORE_WEIGHTS;
  return `(COALESCE((SELECT SUM(${w.view} * d.views + ${w.try} * d.tries) FROM tool_stat_daily d WHERE d.tool_id = t.id${day}), 0)
    + ${w.like} * (SELECT COUNT(*) FROM tool_like l WHERE l.tool_id = t.id${since("l.created_at")})
    + ${w.save} * (SELECT COUNT(*) FROM bookmark b WHERE b.tool_id = t.id${since("b.created_at")}))`;
}
const TRENDING = scoreSql(7);
const POPULAR = Object.fromEntries(PERIODS.map((p) => [p.id, scoreSql(p.days)])) as Record<Period, string>;

// ---------- Daily ranking ----------

/**
 * Points a tool needs in one day before it can be that day's top tool: a few real tries or hearts,
 * so a single stray view on a quiet day never earns a badge. Same weights as Trending/Popular.
 */
export const DAILY_TOP_MIN = 12;
// One or two names under "Top today" read as a fluke on a quiet day; the section waits for a real top three.
export const TOP_TODAY_MIN_TOOLS = 3;
const dailyScores = (from: string) => `SELECT tool_id, day, SUM(pts) AS score FROM (
    SELECT d.tool_id, d.day, ${SCORE_WEIGHTS.view} * d.views + ${SCORE_WEIGHTS.try} * d.tries AS pts FROM tool_stat_daily d WHERE d.day >= ${from}
    UNION ALL SELECT l.tool_id, substr(l.created_at, 1, 10), ${SCORE_WEIGHTS.like} FROM tool_like l WHERE l.created_at >= ${from}
    UNION ALL SELECT b.tool_id, substr(b.created_at, 1, 10), ${SCORE_WEIGHTS.save} FROM bookmark b WHERE b.created_at >= ${from}
  ) GROUP BY tool_id, day`;

/** Today's (UTC) highest-scoring tools that cleared DAILY_TOP_MIN; often empty on a quiet day. */
export async function topToday(db: D1Database, limit = 3): Promise<(ToolWithCredit & { day_score: number })[]> {
  const { results } = await db
    .prepare(
      `${TOOL_SELECT.replace(" FROM tool t", ", s.score AS day_score FROM tool t")}
       JOIN (${dailyScores("date('now')")}) s ON s.tool_id = t.id AND s.day = date('now')
       WHERE t.status = 'published' AND s.score >= ? ORDER BY s.score DESC, t.published_at DESC LIMIT ?`,
    )
    .bind(DAILY_TOP_MIN, limit)
    .all<Row>();
  return results.map((r) => ({ ...toTool(r), day_score: Number(r.day_score) }));
}

/** Finished days in the last 90 when this tool ranked first (ties share it), newest first. */
export async function topDays(db: D1Database, toolId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `WITH s AS (SELECT s.* FROM (${dailyScores("date('now', '-90 days')")}) s JOIN tool t ON t.id = s.tool_id AND t.status = 'published'),
       r AS (SELECT tool_id, day, score, RANK() OVER (PARTITION BY day ORDER BY score DESC) AS place FROM s)
       SELECT day FROM r WHERE tool_id = ? AND place = 1 AND score >= ? AND day < date('now') ORDER BY day DESC`,
    )
    .bind(toolId, DAILY_TOP_MIN)
    .all<{ day: string }>();
  return results.map((r) => r.day);
}

export function parsePeriod(value: string | null): Period {
  return PERIODS.some((p) => p.id === value) ? (value as Period) : "all";
}

function toolFilter(opts: { q?: string; category?: string; tag?: string; exclude?: string[] }) {
  const where = ["t.status = 'published'"];
  const binds: unknown[] = [];
  // Search results rank by where the term matched before the chosen sort, so a tool named for it comes first.
  let relevance = "";
  const relevanceBinds: unknown[] = [];
  if (opts.category) {
    where.push("t.category = ?");
    binds.push(opts.category);
  }
  if (opts.exclude?.length) {
    where.push(`t.id NOT IN (${opts.exclude.map(() => "?").join(", ")})`);
    binds.push(...opts.exclude);
  }
  if (opts.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(t.tags) j WHERE j.value = ?)");
    binds.push(opts.tag);
  }
  if (opts.q) {
    const like = `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push("(t.name LIKE ? ESCAPE '\\' OR t.tagline LIKE ? ESCAPE '\\' OR t.tags LIKE ? ESCAPE '\\' OR t.try_this LIKE ? ESCAPE '\\')");
    binds.push(like, like, like, like);
    relevance = "CASE WHEN t.name LIKE ? ESCAPE '\\' THEN 0 WHEN t.tagline LIKE ? ESCAPE '\\' THEN 1 WHEN t.tags LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END";
    relevanceBinds.push(like, like, like);
  }
  return { where, binds, relevance, relevanceBinds };
}

/** Published tools per category id; categories with none are absent. */
export async function categoryCounts(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(`SELECT category, COUNT(*) AS n FROM tool WHERE status = 'published' GROUP BY category`)
    .all<{ category: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.category, r.n]));
}

export async function countTools(db: D1Database, opts: { q?: string; category?: string; tag?: string } = {}): Promise<number> {
  const { where, binds } = toolFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM tool t WHERE ${where.join(" AND ")}`)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function listTools(
  db: D1Database,
  opts: { q?: string; category?: string; tag?: string; exclude?: string[]; sort?: SortKey; period?: Period; limit?: number; offset?: number } = {},
): Promise<ToolWithCredit[]> {
  const { where, binds, relevance, relevanceBinds } = toolFilter(opts);
  const sort = opts.sort ?? "new";
  const limit = opts.limit ?? 48;
  const offset = opts.offset ?? 0;
  if (sort === "picks") {
    // Ordered in code (lib/picks.ts) over every matching tool; fine for a catalog of hundreds, not of many thousands.
    const extra = `COALESCE((SELECT SUM(s.impressions) FROM surface_stat_daily s WHERE s.tool_id = t.id AND s.day >= date('now', '-30 days')), 0) AS impressions30,
      ${relevance || "0"} AS relevance,`;
    const { results } = await db
      .prepare(`${TOOL_SELECT.replace("SELECT t.*,", `SELECT t.*, ${extra}`)} WHERE ${where.join(" AND ")}`)
      .bind(...relevanceBinds, ...binds)
      .all<Row & PicksInput>();
    return picksOrder(results).slice(offset, offset + limit).map(toTool);
  }
  const rank = sort === "trending" ? TRENDING : POPULAR[opts.period ?? "all"];
  const order = sort === "new" ? "t.published_at DESC, t.name ASC" : `${rank} DESC, t.published_at DESC`;
  const { results } = await db
    .prepare(`${TOOL_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${relevance ? `${relevance}, ` : ""}${order} LIMIT ? OFFSET ?`)
    .bind(...binds, ...relevanceBinds, limit, offset)
    .all<Row>();
  return results.map(toTool);
}

/** How many featured tools the home slideshow shows; positions past it only lead the Picks order. */
export const HERO_SLIDES = 10;

export async function featuredTools(db: D1Database, limit = HERO_SLIDES): Promise<ToolWithCredit[]> {
  const { results } = await db
    .prepare(`${TOOL_SELECT} WHERE t.status = 'published' AND t.featured > 0 ORDER BY t.featured ASC LIMIT ?`)
    .bind(limit)
    .all<Row>();
  return results.map(toTool);
}

export async function getPublishedTool(db: D1Database, slug: string): Promise<ToolWithCredit | null> {
  const row = await db.prepare(`${TOOL_SELECT} WHERE t.slug = ? AND t.status = 'published'`).bind(slug).first<Row>();
  return row ? toTool(row) : null;
}

/**
 * Surprise me. Skips the tool it came from and those already seen this visit (all of them once nothing
 * else is left), prefers another category than the one it came from, and two times in three draws from
 * the half of the catalog with the fewest views and tries in the last 30 days, so it isn't the hits again.
 */
export async function surpriseSlug(db: D1Database, from: string | null, seen: string[], random = Math.random): Promise<string | null> {
  const { results } = await db
    .prepare(
      `SELECT t.slug, t.category,
         COALESCE((SELECT SUM(s.views + s.tries) FROM tool_stat_daily s WHERE s.tool_id = t.id AND s.day >= date('now', '-30 days')), 0) AS exposure
       FROM tool t WHERE t.status = 'published' ORDER BY exposure, t.published_at DESC`,
    )
    .all<{ slug: string; category: string; exposure: number }>();
  const others = results.filter((t) => t.slug !== from);
  const fresh = others.filter((t) => !seen.includes(t.slug));
  const pool = fresh.length ? fresh : others;
  if (!pool.length) return null;
  const fromCategory = results.find((t) => t.slug === from)?.category;
  const elsewhere = pool.filter((t) => t.category !== fromCategory);
  const list = elsewhere.length ? elsewhere : pool;
  const quiet = list.slice(0, Math.max(1, Math.ceil(list.length / 2)));
  const draw = random() < 2 / 3 ? quiet : list;
  return draw[Math.floor(random() * draw.length)].slug;
}

/**
 * Next tool for a discovery session: from the mood's categories (all when null), never one already shown this
 * session, and two times in three from the less-seen half so quiet tools get their turn. Null once all were shown.
 */
export async function discoveryPick(db: D1Database, categories: readonly string[] | null, seen: string[], random = Math.random): Promise<ToolWithCredit | null> {
  const { results } = await db
    .prepare(
      `SELECT t.slug,
         COALESCE((SELECT SUM(s.views + s.tries) FROM tool_stat_daily s WHERE s.tool_id = t.id AND s.day >= date('now', '-30 days')), 0) AS exposure
       FROM tool t WHERE t.status = 'published' AND (?1 IS NULL OR t.category IN (SELECT value FROM json_each(?1)))
       ORDER BY exposure, t.published_at DESC`,
    )
    .bind(categories ? JSON.stringify(categories) : null)
    .all<{ slug: string }>();
  const pool = results.filter((t) => !seen.includes(t.slug));
  if (!pool.length) return null;
  const quiet = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));
  const draw = random() < 2 / 3 ? quiet : pool;
  return getPublishedTool(db, draw[Math.floor(random() * draw.length)].slug);
}

/**
 * Other tools for the detail page. `maker`: same maker name, or the same person's own submissions.
 * `similar`: ranked by shared tags (2 each) plus same category (1), ties shuffled, topped up with
 * random picks so the section is never short; never repeats a `maker` tool.
 */
export async function relatedTools(db: D1Database, tool: Tool, limit = 3): Promise<{ maker: ToolWithCredit[]; similar: ToolWithCredit[] }> {
  const makerWhere = `t.status = 'published' AND t.id != ?1 AND ((?2 != '' AND lower(t.maker_name) = lower(?2))
    OR (?3 != '' AND t.credit_type = 'made' AND t.submitted_by = ?3))`;
  const ownMaker = tool.credit_type === "made" ? (tool.submitted_by ?? "") : "";
  const maker = await db
    .prepare(`${TOOL_SELECT} WHERE ${makerWhere} ORDER BY t.published_at DESC LIMIT ?4`)
    .bind(tool.id, tool.maker_name ?? "", ownMaker, limit)
    .all<Row>();
  const exclude = [tool.id, ...maker.results.map((r) => String(r.id))];
  const score = `(2 * (SELECT COUNT(*) FROM json_each(t.tags) j WHERE j.value IN (SELECT value FROM json_each(?2))) + (t.category = ?3))`;
  const similar = await db
    .prepare(`${TOOL_SELECT} WHERE t.status = 'published' AND t.id NOT IN (SELECT value FROM json_each(?1)) ORDER BY ${score} DESC, random() LIMIT ?4`)
    .bind(JSON.stringify(exclude), JSON.stringify(tool.tags), tool.category, limit)
    .all<Row>();
  return { maker: maker.results.map(toTool), similar: similar.results.map(toTool) };
}

/** Tags that appear on the same tools as `tag`, most shared first. */
export async function relatedTags(db: D1Database, tag: string, limit = 8): Promise<{ tag: string; n: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT o.value AS tag, COUNT(*) AS n FROM tool t, json_each(t.tags) j, json_each(t.tags) o
       WHERE t.status = 'published' AND j.value = ? AND o.value != j.value
       GROUP BY o.value ORDER BY n DESC, o.value ASC LIMIT ?`,
    )
    .bind(tag, limit)
    .all<{ tag: string; n: number }>();
  return results;
}

export const TAG_DESCRIPTION_MAX = 280;

export async function tagDescription(db: D1Database, tag: string): Promise<string | null> {
  const row = await db.prepare(`SELECT description FROM tag_info WHERE tag = ?`).bind(tag).first<{ description: string }>();
  return row?.description ?? null;
}

/** Every tag on a published tool, with its tool count and any editor description. */
export async function listTagsForAdmin(db: D1Database): Promise<{ tag: string; n: number; description: string | null; updated_at: string | null }[]> {
  const { results } = await db
    .prepare(
      `SELECT j.value AS tag, COUNT(*) AS n, i.description, i.updated_at FROM tool t, json_each(t.tags) j
       LEFT JOIN tag_info i ON i.tag = j.value
       WHERE t.status = 'published' GROUP BY j.value ORDER BY n DESC, j.value ASC`,
    )
    .all<{ tag: string; n: number; description: string | null; updated_at: string | null }>();
  return results;
}

/** Sets or clears (empty text) a tag description, with an audit row. */
export async function setTagDescription(db: D1Database, tag: string, description: string, actorId: string): Promise<void> {
  const now = nowIso();
  const write = description
    ? db
        .prepare(
          `INSERT INTO tag_info (tag, description, updated_at, updated_by) VALUES (?,?,?,?)
           ON CONFLICT(tag) DO UPDATE SET description = excluded.description, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .bind(tag, description, now, actorId)
    : db.prepare(`DELETE FROM tag_info WHERE tag = ?`).bind(tag);
  await db.batch([write, auditStmt(db, { actorId, action: "tag_description", from: null, to: null, reason: `#${tag}: ${description || "(cleared)"}`.slice(0, 600) })]);
}

/** A tag page with fewer tools than this is thin: kept out of the sitemap and noindexed. */
export const TAG_INDEX_MIN = 2;

export async function sitemapEntries(db: D1Database) {
  const tools = await db
    .prepare(`SELECT id, slug, name, updated_at, image_url, image_key FROM tool WHERE status = 'published' ORDER BY published_at DESC`)
    .all<{ id: string; slug: string; name: string; updated_at: string; image_url: string | null; image_key: string | null }>();
  const collections = await db
    .prepare(`SELECT slug, updated_at FROM collection WHERE status = 'published'`)
    .all<{ slug: string; updated_at: string }>();
  const tags = await db
    .prepare(
      `SELECT j.value AS tag FROM tool t, json_each(t.tags) j WHERE t.status = 'published'
       GROUP BY j.value HAVING COUNT(*) >= ${TAG_INDEX_MIN} ORDER BY j.value`,
    )
    .all<{ tag: string }>();
  return { tools: tools.results, collections: collections.results, tags: tags.results.map((r) => r.tag) };
}

// ---------- Duplicates ----------

export async function findDuplicate(
  db: D1Database,
  key: string,
  excludeSubmissionId?: string,
): Promise<{ kind: "tool"; slug: string } | { kind: "submission" } | null> {
  // The tool this submission itself published is not a duplicate of it.
  const tool = await db
    .prepare(`SELECT slug, status FROM tool WHERE canonical_key = ?1 AND (?2 IS NULL OR submission_id IS NOT ?2)`)
    .bind(key, excludeSubmissionId ?? null)
    .first<{ slug: string; status: string }>();
  if (tool) return { kind: "tool", slug: tool.slug };
  const sub = await db
    .prepare(`SELECT id FROM submission WHERE canonical_key = ? AND status IN ('pending','in_review','needs_changes') AND id != ?`)
    .bind(key, excludeSubmissionId ?? "")
    .first();
  return sub ? { kind: "submission" } : null;
}

// ---------- Submissions ----------

export async function createSubmission(
  db: D1Database,
  userId: string,
  input: SubmissionInput,
  sourceMeta: Record<string, unknown>,
  imageUrl: string | null,
  imageKey: string | null = null,
): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO submission (id, user_id, origin, url, canonical_key, name, tagline, try_this, why, category, tags, maker_name, maker_url, source_meta, image_url, image_key, image_rights_at, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,
      )
      .bind(
        id, userId, input.origin, input.url, input.canonicalKey, input.name, input.tagline, input.tryThis, input.why,
        input.category, JSON.stringify(input.tags), input.makerName, input.makerUrl, JSON.stringify(sourceMeta), imageUrl, imageKey, imageKey ? now : null, now, now,
      ),
    auditStmt(db, { submissionId: id, actorId: userId, action: "submit", from: null, to: "pending", reason: null }),
  ]);
  return id;
}

export async function updateSubmissionContent(
  db: D1Database,
  sub: Submission,
  actorId: string,
  input: SubmissionInput,
  nextStatus: SubmissionStatus,
  /** New uploaded cover key, null to remove it, undefined to keep the current one. */
  imageKey?: string | null,
): Promise<boolean> {
  const now = nowIso();
  const key = imageKey === undefined ? sub.image_key : imageKey;
  const rightsAt = imageKey === undefined ? sub.image_rights_at : imageKey ? now : null;
  const [res] = await db.batch([
    db
      .prepare(
        `UPDATE submission SET origin=?, url=?, canonical_key=?, name=?, tagline=?, try_this=?, why=?, category=?, tags=?, maker_name=?, maker_url=?, image_key=?, image_rights_at=?, status=?, updated_at=?
         WHERE id = ? AND user_id = ? AND status = ?`,
      )
      .bind(
        input.origin, input.url, input.canonicalKey, input.name, input.tagline, input.tryThis, input.why, input.category,
        JSON.stringify(input.tags), input.makerName, input.makerUrl, key, rightsAt, nextStatus, now, sub.id, actorId, sub.status,
      ),
    db
      .prepare(
        `INSERT INTO moderation_event (id, submission_id, tool_id, actor_id, action, from_status, to_status, reason, created_at)
         SELECT ?,?,NULL,?,?,?,?,NULL,? WHERE EXISTS (SELECT 1 FROM submission WHERE id = ? AND updated_at = ?)`,
      )
      .bind(newId(), sub.id, actorId, nextStatus === sub.status ? "edit" : "resubmit", sub.status, nextStatus, now, sub.id, now),
  ]);
  return (res.meta.changes ?? 0) > 0;
}

export async function getSubmission(db: D1Database, id: string): Promise<Submission | null> {
  const row = await db.prepare(`SELECT * FROM submission WHERE id = ?`).bind(id).first<Row>();
  return row ? toSubmission(row) : null;
}

export interface ToolInsight {
  slug: string;
  name: string;
  seen30: number;
  views30: number;
  tries30: number;
  views: number;
  tries: number;
  saves: number;
  hearts: number;
  comments: number;
  credit_type: string | null;
  /** The newest product update, if any. */
  update_status: string | null;
  update_note: string | null;
}

/** Real counts for the published tools someone listed (made or found), for their own eyes only. */
export async function myToolInsights(db: D1Database, userId: string): Promise<ToolInsight[]> {
  const { results } = await db
    .prepare(
      `SELECT t.slug, t.name,
         COALESCE((SELECT SUM(s.impressions) FROM surface_stat_daily s WHERE s.tool_id = t.id AND s.day >= date('now', '-30 days')), 0) AS seen30,
         COALESCE((SELECT SUM(s.views) FROM tool_stat_daily s WHERE s.tool_id = t.id AND s.day >= date('now', '-30 days')), 0) AS views30,
         COALESCE((SELECT SUM(s.tries) FROM tool_stat_daily s WHERE s.tool_id = t.id AND s.day >= date('now', '-30 days')), 0) AS tries30,
         COALESCE((SELECT SUM(s.views) FROM tool_stat_daily s WHERE s.tool_id = t.id), 0) AS views,
         COALESCE((SELECT SUM(s.tries) FROM tool_stat_daily s WHERE s.tool_id = t.id), 0) AS tries,
         (SELECT COUNT(*) FROM bookmark b WHERE b.tool_id = t.id) AS saves,
         (SELECT COUNT(*) FROM tool_like l WHERE l.tool_id = t.id) AS hearts,
         (SELECT COUNT(*) FROM comment c WHERE c.tool_id = t.id AND c.status = 'visible') AS comments,
         t.credit_type, u.status AS update_status, u.moderator_note AS update_note
       FROM tool t LEFT JOIN tool_update u ON u.id = (SELECT id FROM tool_update WHERE tool_id = t.id ORDER BY created_at DESC LIMIT 1) WHERE t.submitted_by = ? AND t.status = 'published' ORDER BY t.published_at DESC`,
    )
    .bind(userId)
    .all<ToolInsight>();
  return results;
}

export async function listMySubmissions(db: D1Database, userId: string): Promise<(Submission & { tool_slug: string | null; tool_verified_at: string | null; tool_made: boolean })[]> {
  const { results } = await db
    .prepare(
      `SELECT s.*, t.slug AS tool_slug, t.maker_verified_at AS tool_verified_at, t.credit_type AS tool_credit FROM submission s LEFT JOIN tool t ON t.id = s.tool_id AND t.status = 'published'
       WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 100`,
    )
    .bind(userId)
    .all<Row>();
  return results.map((r) => ({ ...toSubmission(r), tool_slug: (r.tool_slug as string) ?? null, tool_verified_at: (r.tool_verified_at as string) ?? null, tool_made: r.tool_credit === "made" }));
}

export async function listQueue(
  db: D1Database,
  opts: { status?: string; origin?: string; sort?: "oldest" | "newest" },
): Promise<(Submission & { submitter_name: string; submitter_email: string })[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.status && opts.status !== "all") {
    where.push("s.status = ?");
    binds.push(opts.status);
  }
  if (opts.origin === "made" || opts.origin === "found") {
    where.push("s.origin = ?");
    binds.push(opts.origin);
  }
  const { results } = await db
    .prepare(
      `SELECT s.*, u.name AS submitter_name, u.email AS submitter_email FROM submission s JOIN "user" u ON u.id = s.user_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY s.created_at ${opts.sort === "newest" ? "DESC" : "ASC"} LIMIT 200`,
    )
    .bind(...binds)
    .all<Row>();
  return results.map((r) => ({ ...toSubmission(r), submitter_name: r.submitter_name as string, submitter_email: r.submitter_email as string }));
}

export async function queueCounts(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare(`SELECT status, COUNT(*) AS n FROM submission GROUP BY status`).all<{ status: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.status, r.n]));
}

export async function submissionHistory(db: D1Database, submissionId: string) {
  const { results } = await db
    .prepare(
      `SELECT e.*, u.name AS actor_name FROM moderation_event e LEFT JOIN "user" u ON u.id = e.actor_id
       WHERE e.submission_id = ? ORDER BY e.created_at ASC`,
    )
    .bind(submissionId)
    .all<{ id: string; action: string; from_status: string | null; to_status: string | null; reason: string | null; created_at: string; actor_name: string | null }>();
  return results;
}

export function auditStmt(
  db: D1Database,
  e: { submissionId?: string | null; toolId?: string | null; actorId: string | null; action: string; from: string | null; to: string | null; reason: string | null },
) {
  return db
    .prepare(
      `INSERT INTO moderation_event (id, submission_id, tool_id, actor_id, action, from_status, to_status, reason, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .bind(newId(), e.submissionId ?? null, e.toolId ?? null, e.actorId, e.action, e.from, e.to, e.reason, nowIso());
}

/** Applies a moderator transition atomically; approve also publishes a tool row. Returns tool slug on approve. */
export async function applyModeration(
  db: D1Database,
  sub: Submission,
  actorId: string,
  action: string,
  to: SubmissionStatus,
  reason: string,
  useImage = true,
  useUpload = true,
): Promise<{ slug?: string; conflict?: string }> {
  const now = nowIso();
  const note = reason.trim() || null;
  const guard = db
    .prepare(`UPDATE submission SET status = ?, moderator_note = COALESCE(?, moderator_note), updated_at = ? WHERE id = ? AND status = ?`)
    .bind(to, note, now, sub.id, sub.status);
  // Only record the event if our guarded UPDATE actually applied (same transaction, same timestamp).
  const audit = db
    .prepare(
      `INSERT INTO moderation_event (id, submission_id, tool_id, actor_id, action, from_status, to_status, reason, created_at)
       SELECT ?,?,NULL,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM submission WHERE id = ? AND status = ? AND updated_at = ?)`,
    )
    .bind(newId(), sub.id, actorId, action, sub.status, to, note, now, sub.id, to, now);
  // Same guard as the audit row: the submitter hears about it only if the change applied.
  const notify = NOTIFY_STATUSES.includes(to)
    ? [
        db
          .prepare(
            `INSERT INTO notification (id, user_id, kind, submission_id, status, created_at)
             SELECT ?,?,'submission',?,?,? WHERE EXISTS (SELECT 1 FROM submission WHERE id = ? AND status = ? AND updated_at = ?)`,
          )
          .bind(newId(), sub.user_id, sub.id, to, now, sub.id, to, now),
      ]
    : [];

  if (to !== "published") {
    const [res] = await db.batch([guard, audit, ...notify]);
    if (!res.meta.changes) return { conflict: "Submission changed meanwhile. Reload and retry." };
    return {};
  }

  const dup = await db.prepare(`SELECT slug FROM tool WHERE canonical_key = ?`).bind(sub.canonical_key).first<{ slug: string }>();
  if (dup) return { conflict: `A tool with this URL already exists (/tools/${dup.slug}).` };
  const slug = await uniqueSlug(db, sub.name);
  const toolId = newId();
  const art = JSON.stringify(artFor(sub.name));
  const [res] = await db.batch([
    guard,
    db
      .prepare(
        `INSERT INTO tool (id, slug, name, url, canonical_key, tagline, try_this, why, category, tags, maker_name, maker_url, image_url, image_key, art, status, submission_id, submitted_by, credit_type, published_at, updated_at)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published',?,?,?,?,? WHERE changes() > 0`,
      )
      .bind(
        toolId, slug, sub.name, sub.url, sub.canonical_key, sub.tagline, sub.try_this, sub.why, sub.category,
        JSON.stringify(sub.tags), sub.maker_name, sub.maker_url, useImage ? sub.image_url : null, useUpload ? sub.image_key : null, art, sub.id, sub.user_id, sub.origin, now, now,
      ),
    db.prepare(`UPDATE submission SET tool_id = ? WHERE id = ? AND status = 'published'`).bind(toolId, sub.id),
    audit,
    ...notify,
  ]);
  if (!res.meta.changes) return { conflict: "Submission changed meanwhile. Reload and retry." };
  return { slug };
}

export async function setToolVisibility(db: D1Database, toolId: string, actorId: string, hide: boolean, reason: string) {
  const tool = await db.prepare(`SELECT status FROM tool WHERE id = ?`).bind(toolId).first<{ status: string }>();
  if (!tool) return false;
  const to = hide ? "hidden" : "published";
  await db.batch([
    db.prepare(`UPDATE tool SET status = ?, hidden_reason = ?, updated_at = ? WHERE id = ?`).bind(to, hide ? reason : null, nowIso(), toolId),
    auditStmt(db, { toolId, actorId, action: hide ? "hide" : "unhide", from: tool.status, to, reason: reason || null }),
  ]);
  return true;
}

export async function uniqueSlug(db: D1Database, name: string): Promise<string> {
  const base = slugify(name);
  const { results } = await db
    .prepare(`SELECT slug FROM tool WHERE slug = ? OR slug LIKE ?`)
    .bind(base, `${base}-%`)
    .all<{ slug: string }>();
  const taken = new Set(results.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

const PALETTES = [
  ["#ff7a59", "#ffc94d", "#b69cff", "#fff4e6"],
  ["#7c5cff", "#ff8fb1", "#ffd166", "#f4f0ff"],
  ["#2ec4b6", "#ffbf69", "#ff6b6b", "#eefcf9"],
  ["#ff9f1c", "#6a4cff", "#ffd6e0", "#fff8ec"],
  ["#4d96ff", "#ffd93d", "#ff6b9a", "#eef5ff"],
  ["#ff5d8f", "#ffb347", "#8fd3ff", "#fff1f5"],
];
const MOTIFS: ToolArt["motif"][] = ["blobs", "waves", "grid", "sparks", "stack"];

/** Deterministic original cover-art preset from a name (never a third-party screenshot). */
export function artFor(name: string): ToolArt {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { palette: PALETTES[h % PALETTES.length], motif: MOTIFS[(h >>> 3) % MOTIFS.length] };
}

// ---------- Bookmarks ----------

export async function listBookmarkIds(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db.prepare(`SELECT tool_id FROM bookmark WHERE user_id = ?`).bind(userId).all<{ tool_id: string }>();
  return results.map((r) => r.tool_id);
}

export async function setBookmark(db: D1Database, userId: string, toolId: string, saved: boolean): Promise<boolean> {
  if (saved) {
    const res = await db
      .prepare(`INSERT OR IGNORE INTO bookmark (user_id, tool_id, created_at) SELECT ?, id, ? FROM tool WHERE id = ? AND status = 'published'`)
      .bind(userId, nowIso(), toolId)
      .run();
    return res.meta.changes > 0 || Boolean(await db.prepare(`SELECT 1 FROM bookmark WHERE user_id=? AND tool_id=?`).bind(userId, toolId).first());
  }
  await db.prepare(`DELETE FROM bookmark WHERE user_id = ? AND tool_id = ?`).bind(userId, toolId).run();
  return true;
}

export async function listSavedTools(db: D1Database, userId: string): Promise<ToolWithCredit[]> {
  const { results } = await db
    .prepare(`${TOOL_SELECT} JOIN bookmark b ON b.tool_id = t.id WHERE b.user_id = ? AND t.status = 'published' ORDER BY b.created_at DESC`)
    .bind(userId)
    .all<Row>();
  return results.map(toTool);
}

export async function listLikedTools(db: D1Database, userId: string): Promise<ToolWithCredit[]> {
  const { results } = await db
    .prepare(`${TOOL_SELECT} JOIN tool_like hl ON hl.tool_id = t.id WHERE hl.user_id = ? AND t.status = 'published' ORDER BY hl.created_at DESC LIMIT 120`)
    .bind(userId)
    .all<Row>();
  return results.map(toTool);
}

// ---------- Collections ----------

export async function listCollections(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM collection_tool ct JOIN tool t ON t.id = ct.tool_id AND t.status='published' WHERE ct.collection_id = c.id) AS tool_count
       FROM collection c WHERE c.status = 'published' ORDER BY c.published_at DESC`,
    )
    .all<{ id: string; slug: string; title: string; description: string; published_at: string; tool_count: number }>();
  return results;
}

/** First few tools of each published collection, for the cover mosaic on /collections. */
export async function collectionPreviews(db: D1Database, perCollection = 3): Promise<Map<string, ToolWithCredit[]>> {
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT t.*, u.name AS submitter_name, u.handle AS submitter_handle, ct.collection_id AS preview_collection,
           ROW_NUMBER() OVER (PARTITION BY ct.collection_id ORDER BY ct.position) AS preview_rank
         FROM tool t LEFT JOIN "user" u ON u.id = t.submitted_by JOIN collection_tool ct ON ct.tool_id = t.id
         WHERE t.status = 'published'
       ) WHERE preview_rank <= ?`,
    )
    .bind(perCollection)
    .all<Row & { preview_collection: string }>();
  const out = new Map<string, ToolWithCredit[]>();
  for (const row of results) {
    const list = out.get(row.preview_collection) ?? [];
    list.push(toTool(row));
    out.set(row.preview_collection, list);
  }
  return out;
}

export async function getCollection(db: D1Database, slug: string) {
  const c = await db
    .prepare(`SELECT * FROM collection WHERE slug = ? AND status = 'published'`)
    .bind(slug)
    .first<{ id: string; slug: string; title: string; description: string; published_at: string; updated_at: string }>();
  if (!c) return null;
  const { results } = await db
    .prepare(`${TOOL_SELECT} JOIN collection_tool ct ON ct.tool_id = t.id WHERE ct.collection_id = ? AND t.status = 'published' ORDER BY ct.position`)
    .bind(c.id)
    .all<Row>();
  return { ...c, tools: results.map(toTool) };
}

/**
 * Home page picks: the newest published collection with at least three live tools besides `skip` (the
 * hero's). Editors refresh the section by publishing a collection, so it is always a real, dated choice.
 */
export async function homePicks(db: D1Database, skip: string[] = []) {
  const notIn = skip.length ? `AND t.id NOT IN (${skip.map(() => "?").join(", ")})` : "";
  const row = await db
    .prepare(
      `SELECT c.slug FROM collection c WHERE c.status = 'published'
         AND (SELECT COUNT(*) FROM collection_tool ct JOIN tool t ON t.id = ct.tool_id AND t.status = 'published' ${notIn} WHERE ct.collection_id = c.id) >= 3
       ORDER BY c.published_at DESC LIMIT 1`,
    )
    .bind(...skip)
    .first<{ slug: string }>();
  if (!row) return null;
  const c = await getCollection(db, row.slug);
  return c && { ...c, tools: c.tools.filter((t) => !skip.includes(t.id)).slice(0, 6) };
}

// ---------- Engagement ----------

export async function recordStat(db: D1Database, toolId: string, kind: "tries" | "views"): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO tool_stat_daily (tool_id, day, ${kind}) SELECT id, date('now'), 1 FROM tool WHERE id = ? AND status = 'published'
       ON CONFLICT(tool_id, day) DO UPDATE SET ${kind} = ${kind} + 1`,
    )
    .bind(toolId)
    .run();
  return res.meta.changes > 0;
}

/** Adds an accepted view or try to its discovery surface. Call only after tool_stat_daily counted it. */
export async function recordSurfaceStat(db: D1Database, toolId: string, surface: string, kind: "tries" | "views"): Promise<void> {
  await db
    .prepare(
      `INSERT INTO surface_stat_daily (day, surface, tool_id, ${kind}) VALUES (date('now'), ?, ?, 1)
       ON CONFLICT(day, surface, tool_id) DO UPDATE SET ${kind} = ${kind} + 1`,
    )
    .bind(surface, toolId)
    .run();
}

/** Cards seen on screen; ids that aren't published tools are skipped by the SELECT. */
export async function recordImpressions(db: D1Database, items: { surface: string; toolId: string }[]): Promise<void> {
  if (!items.length) return;
  await db.batch(
    items.map((i) =>
      db
        .prepare(
          `INSERT INTO surface_stat_daily (day, surface, tool_id, impressions) SELECT date('now'), ?, id, 1 FROM tool WHERE id = ? AND status = 'published'
           ON CONFLICT(day, surface, tool_id) DO UPDATE SET impressions = impressions + 1`,
        )
        .bind(i.surface, i.toolId),
    ),
  );
}

/** One more visitor today who clicked through to at least one tool. */
export async function recordTryer(db: D1Database): Promise<void> {
  await db
    .prepare(`INSERT INTO site_stat_daily (day, tryers) VALUES (date('now'), 1) ON CONFLICT(day) DO UPDATE SET tryers = tryers + 1`)
    .run();
}

export async function listLikedIds(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db.prepare(`SELECT tool_id FROM tool_like WHERE user_id = ?`).bind(userId).all<{ tool_id: string }>();
  return results.map((r) => r.tool_id);
}

export async function setLike(db: D1Database, userId: string, toolId: string, liked: boolean): Promise<void> {
  if (liked) {
    await db
      .prepare(`INSERT OR IGNORE INTO tool_like (user_id, tool_id, created_at) SELECT ?, id, ? FROM tool WHERE id = ? AND status = 'published'`)
      .bind(userId, nowIso(), toolId)
      .run();
  } else {
    await db.prepare(`DELETE FROM tool_like WHERE user_id = ? AND tool_id = ?`).bind(userId, toolId).run();
  }
}

export async function popularTags(db: D1Database, limit = 8): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT j.value AS tag, COUNT(*) AS n FROM tool t, json_each(t.tags) j
       WHERE t.status = 'published' GROUP BY j.value ORDER BY n DESC, j.value ASC LIMIT ?`,
    )
    .bind(limit)
    .all<{ tag: string; n: number }>();
  return results.map((r) => r.tag);
}

// ---------- Profiles ----------

export interface Profile {
  id: string;
  name: string;
  handle: string;
  bio: string | null;
  website: string | null;
  role: string;
  created_at: string;
  avatar: string | null;
  image: string | null;
}

export interface MyProfile {
  name: string;
  handle: string | null;
  bio: string | null;
  website: string | null;
  handle_changed_at: string | null;
  avatar: string | null;
  image: string | null;
}

export async function getProfileByHandle(db: D1Database, handle: string): Promise<Profile | null> {
  return db
    .prepare(`SELECT id, name, handle, bio, website, role, "createdAt" AS created_at, avatar, image FROM "user" WHERE handle = ?`)
    .bind(handle.toLowerCase())
    .first<Profile>();
}

export async function getMyProfile(db: D1Database, userId: string): Promise<MyProfile | null> {
  return db.prepare(`SELECT name, handle, bio, website, handle_changed_at, avatar, image FROM "user" WHERE id = ?`).bind(userId).first<MyProfile>();
}

/** Handles can change once a week, so a freed handle can't be bounced between accounts. */
export const HANDLE_COOLDOWN_DAYS = 7;

export async function updateProfile(
  db: D1Database,
  userId: string,
  input: { name: string; handle: string; bio: string | null; website: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await getMyProfile(db, userId);
  if (!current) return { ok: false, error: "Account not found." };
  if (current.handle && current.handle !== input.handle && current.handle_changed_at) {
    const next = Date.parse(current.handle_changed_at) + HANDLE_COOLDOWN_DAYS * 86400_000;
    if (Date.now() < next) return { ok: false, error: `You can change your handle again on ${new Date(next).toUTCString().slice(5, 16)}.` };
  }
  const taken = await db.prepare(`SELECT 1 FROM "user" WHERE handle = ? AND id != ?`).bind(input.handle, userId).first();
  if (taken) return { ok: false, error: "That handle is taken." };
  const now = nowIso();
  try {
    await db
      .prepare(
        `UPDATE "user" SET name = ?, bio = ?, website = ?, "updatedAt" = ?,
           handle_changed_at = CASE WHEN handle IS ? THEN handle_changed_at ELSE ? END, handle = ?
         WHERE id = ?`,
      )
      .bind(input.name, input.bio, input.website, now, input.handle, now, input.handle, userId)
      .run();
  } catch {
    // Lost a race for the same handle against the UNIQUE index.
    return { ok: false, error: "That handle is taken." };
  }
  return { ok: true };
}

/** Switches the profile photo only if it is still `from`, so two uploads can't both think they won. */
export async function setAvatar(db: D1Database, userId: string, from: string | null, to: string | null): Promise<boolean> {
  const res = await db.prepare(`UPDATE "user" SET avatar = ?, "updatedAt" = ? WHERE id = ? AND avatar IS ?`).bind(to, nowIso(), userId, from).run();
  return res.meta.changes > 0;
}

/** A moderator takes a photo down: initials from now on, with an audit row. */
export async function removeAvatarAsModerator(db: D1Database, target: { id: string; avatar: string | null }, actorId: string, reason: string | null): Promise<boolean> {
  const [res] = await db.batch([
    db.prepare(`UPDATE "user" SET avatar = 'none', "updatedAt" = ? WHERE id = ? AND avatar IS ?`).bind(nowIso(), target.id, target.avatar),
    db
      .prepare(
        `INSERT INTO moderation_event (id, subject_user_id, actor_id, action, from_status, to_status, reason, created_at)
         SELECT ?,?,?,'remove_avatar',?,'none',?,? WHERE changes() > 0`,
      )
      .bind(newId(), target.id, actorId, target.avatar ?? "provider", reason, nowIso()),
  ]);
  return res.meta.changes > 0;
}

/** Published tools a user is credited for, newest first. */
export async function profileTools(db: D1Database, userId: string): Promise<ToolWithCredit[]> {
  const { results } = await db
    .prepare(`${TOOL_SELECT} WHERE t.submitted_by = ? AND t.status = 'published' AND t.credit_type IN ('made', 'found') ORDER BY t.published_at DESC LIMIT 60`)
    .bind(userId)
    .all<Row>();
  return results.map(toTool);
}

// ---------- Comments ----------

export interface CommentRow {
  id: string;
  tool_id: string;
  user_id: string | null;
  parent_id: string | null;
  body: string;
  status: CommentStatus;
  hidden_reason: string | null;
  created_at: string;
  edited_at: string | null;
  author_name: string | null;
  author_handle: string | null;
  author_role: string | null;
  author_avatar: string | null;
  author_image: string | null;
}

export interface CommentThread extends CommentRow {
  replies: CommentRow[];
}

type CommentWithTool = CommentRow & { tool_slug: string; tool_name: string; tool_status: string };

const COMMENT_SELECT = `SELECT c.*, u.name AS author_name, u.handle AS author_handle, u.role AS author_role, u.avatar AS author_avatar, u.image AS author_image,
    t.slug AS tool_slug, t.name AS tool_name, t.status AS tool_status
  FROM comment c LEFT JOIN "user" u ON u.id = c.user_id JOIN tool t ON t.id = c.tool_id`;

/** Threads for a tool page. Hidden and deleted comments stay only as empty placeholders that keep replies in context. */
export async function listComments(db: D1Database, toolId: string): Promise<CommentThread[]> {
  const { results } = await db.prepare(`${COMMENT_SELECT} WHERE c.tool_id = ? ORDER BY c.created_at ASC LIMIT 500`).bind(toolId).all<CommentRow>();
  const replies = new Map<string, CommentRow[]>();
  for (const c of results) {
    if (c.parent_id && c.status === "visible") replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c]);
  }
  return results
    .filter((c) => !c.parent_id && (c.status === "visible" || replies.has(c.id)))
    .map((c) => ({
      ...(c.status === "visible" ? c : { ...c, body: "", hidden_reason: null, user_id: null, author_name: null, author_handle: null, author_role: null, author_avatar: null, author_image: null }),
      replies: replies.get(c.id) ?? [],
    }));
}

export async function countComments(db: D1Database, toolId: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM comment WHERE tool_id = ? AND status = 'visible'`).bind(toolId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getComment(db: D1Database, id: string): Promise<CommentWithTool | null> {
  return db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).bind(id).first<CommentWithTool>();
}

export async function createComment(
  db: D1Database,
  input: { toolId: string; userId: string; parentId: string | null; body: string },
): Promise<{ ok: true; id: string } | { ok: false; status: 400 | 404 | 409; error: string }> {
  const tool = await db.prepare(`SELECT id FROM tool WHERE id = ? AND status = 'published'`).bind(input.toolId).first();
  if (!tool) return { ok: false, status: 404, error: "Tool not found." };
  if (input.parentId) {
    const parent = await db
      .prepare(`SELECT parent_id, status FROM comment WHERE id = ? AND tool_id = ?`)
      .bind(input.parentId, input.toolId)
      .first<{ parent_id: string | null; status: string }>();
    if (!parent || parent.status !== "visible") return { ok: false, status: 409, error: "That comment can't be replied to." };
    if (parent.parent_id) return { ok: false, status: 400, error: "Replies go one level deep." };
  }
  const dup = await db
    .prepare(`SELECT 1 FROM comment WHERE user_id = ? AND tool_id = ? AND body = ? AND created_at > ?`)
    .bind(input.userId, input.toolId, input.body, new Date(Date.now() - 10 * 60_000).toISOString())
    .first();
  if (dup) return { ok: false, status: 409, error: "You just posted that." };
  const id = newId();
  const now = nowIso();
  await db.batch([
    db
      .prepare(`INSERT INTO comment (id, tool_id, user_id, parent_id, body, status, created_at) VALUES (?,?,?,?,?,'visible',?)`)
      .bind(id, input.toolId, input.userId, input.parentId, input.body, now),
    db
      .prepare(
        `INSERT INTO notification (id, user_id, kind, comment_id, created_at)
         SELECT ?, p.user_id, 'comment_reply', ?, ? FROM comment p WHERE p.id = ? AND p.user_id IS NOT NULL AND p.user_id != ?`,
      )
      .bind(newId(), id, now, input.parentId, input.userId),
    // Whoever listed the tool hears about new comments on it, unless the reply notice above already went to them.
    db
      .prepare(
        `INSERT INTO notification (id, user_id, kind, comment_id, created_at)
         SELECT ?, t.submitted_by, 'tool_comment', ?, ? FROM tool t
         WHERE t.id = ? AND t.submitted_by IS NOT NULL AND t.submitted_by != ?
           AND NOT EXISTS (SELECT 1 FROM comment p WHERE p.id = ? AND p.user_id = t.submitted_by)`,
      )
      .bind(newId(), id, now, input.toolId, input.userId, input.parentId),
  ]);
  return { ok: true, id };
}

export async function editComment(db: D1Database, id: string, userId: string, body: string): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE comment SET body = ?, edited_at = ? WHERE id = ? AND user_id = ? AND status = 'visible'`)
    .bind(body, nowIso(), id, userId)
    .run();
  return res.meta.changes > 0;
}

/** Authors delete by blanking the text; open reports on it close since there is nothing left to review. */
export async function deleteOwnComment(db: D1Database, id: string, userId: string): Promise<boolean> {
  const now = nowIso();
  const [res] = await db.batch([
    db.prepare(`UPDATE comment SET body = '', status = 'deleted', edited_at = ? WHERE id = ? AND user_id = ? AND status = 'visible'`).bind(now, id, userId),
    db
      .prepare(
        `UPDATE report SET status = 'resolved', resolution = 'Deleted by author', resolved_at = ?
         WHERE target_type = 'comment' AND target_id = ? AND status = 'open' AND EXISTS (SELECT 1 FROM comment WHERE id = ? AND status = 'deleted' AND edited_at = ?)`,
      )
      .bind(now, id, id, now),
  ]);
  return res.meta.changes > 0;
}

/** Moderator hide/restore: guarded UPDATE plus audit row. Hiding resolves open reports, restoring dismisses them. */
export async function moderateComment(
  db: D1Database,
  comment: { id: string; status: CommentStatus },
  actorId: string,
  action: string,
  to: CommentStatus,
  reason: string,
): Promise<boolean> {
  const now = nowIso();
  const note = reason.trim() || null;
  const [res] = await db.batch([
    db.prepare(`UPDATE comment SET status = ?, hidden_reason = ? WHERE id = ? AND status = ?`).bind(to, to === "hidden" ? note : null, comment.id, comment.status),
    db
      .prepare(`INSERT INTO moderation_event (id, comment_id, actor_id, action, from_status, to_status, reason, created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes() > 0`)
      .bind(newId(), comment.id, actorId, action, comment.status, to, note, now),
    db
      .prepare(
        `UPDATE report SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ?
         WHERE target_type = 'comment' AND target_id = ? AND status = 'open' AND EXISTS (SELECT 1 FROM comment WHERE id = ? AND status = ?)`,
      )
      .bind(to === "hidden" ? "resolved" : "dismissed", to === "hidden" ? (note ?? "Hidden") : "Kept", actorId, now, comment.id, comment.id, to),
  ]);
  return res.meta.changes > 0;
}

export async function recentComments(db: D1Database, status: CommentStatus | "all", limit = 100) {
  const { results } = await db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.handle AS author_handle, u.email AS author_email, t.slug AS tool_slug, t.name AS tool_name,
         (SELECT COUNT(*) FROM report r WHERE r.target_type = 'comment' AND r.target_id = c.id AND r.status = 'open') AS open_reports
       FROM comment c LEFT JOIN "user" u ON u.id = c.user_id JOIN tool t ON t.id = c.tool_id
       ${status === "all" ? "" : "WHERE c.status = ?"} ORDER BY c.created_at DESC LIMIT ?`,
    )
    .bind(...(status === "all" ? [] : [status]), limit)
    .all<CommentRow & { author_email: string | null; tool_slug: string; tool_name: string; open_reports: number }>();
  return results;
}

// ---------- Notifications ----------

// Comment notices count only while the comment and its tool are still public.
const NOTIFICATION_FROM = `FROM notification n
  LEFT JOIN submission s ON s.id = n.submission_id
  LEFT JOIN comment c ON c.id = n.comment_id
  LEFT JOIN tool t ON t.id = COALESCE(c.tool_id, s.tool_id)
  LEFT JOIN "user" u ON u.id = c.user_id
  WHERE n.user_id = ? AND (n.comment_id IS NULL OR (c.status = 'visible' AND t.status = 'published'))`;

export async function listNotifications(db: D1Database, userId: string, limit = 50): Promise<NotificationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT n.id, n.kind, n.status, n.created_at, n.read_at, n.submission_id, s.name AS submission_name, s.moderator_note,
         n.comment_id, c.body AS comment_body, u.name AS actor_name, t.slug AS tool_slug, t.name AS tool_name, t.credit_type AS tool_credit
       ${NOTIFICATION_FROM} ORDER BY n.created_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<NotificationRow>();
  return results;
}

export async function unreadNotifications(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n ${NOTIFICATION_FROM} AND n.read_at IS NULL`).bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function markNotificationsRead(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`UPDATE notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL`).bind(nowIso(), userId).run();
}

export async function pruneNotifications(db: D1Database, before: string): Promise<void> {
  await db.prepare(`DELETE FROM notification WHERE created_at < ?`).bind(before).run();
}

// ---------- Reports ----------

export async function createReport(
  db: D1Database,
  input: { targetType: "tool" | "comment"; targetId: string; reporterId: string; reason: string; note: string | null },
): Promise<{ ok: true; duplicate: boolean; autoHidden: boolean } | { ok: false; error: string }> {
  const target =
    input.targetType === "tool"
      ? await db.prepare(`SELECT id FROM tool WHERE id = ? AND status = 'published'`).bind(input.targetId).first()
      : await db.prepare(`SELECT id FROM comment WHERE id = ? AND status = 'visible'`).bind(input.targetId).first();
  if (!target) return { ok: false, error: "There's nothing to report there any more." };
  const res = await db
    .prepare(`INSERT OR IGNORE INTO report (id, target_type, target_id, reporter_id, reason, note, status, created_at) VALUES (?,?,?,?,?,?,'open',?)`)
    .bind(newId(), input.targetType, input.targetId, input.reporterId, input.reason, input.note, nowIso())
    .run();
  const duplicate = res.meta.changes === 0;
  let autoHidden = false;
  if (!duplicate && input.targetType === "comment") {
    const row = await db
      .prepare(`SELECT COUNT(DISTINCT reporter_id) AS n FROM report WHERE target_type = 'comment' AND target_id = ? AND status = 'open'`)
      .bind(input.targetId)
      .first<{ n: number }>();
    if ((row?.n ?? 0) >= AUTO_HIDE_REPORTS) {
      // Hidden pending review; the reports stay open so a moderator still makes the call.
      const [hide] = await db.batch([
        db
          .prepare(`UPDATE comment SET status = 'hidden', hidden_reason = ? WHERE id = ? AND status = 'visible'`)
          .bind(`Hidden after ${AUTO_HIDE_REPORTS} reports, awaiting review`, input.targetId),
        db
          .prepare(
            `INSERT INTO moderation_event (id, comment_id, actor_id, action, from_status, to_status, reason, created_at)
             SELECT ?,?,NULL,'auto_hide','visible','hidden',?,? WHERE changes() > 0`,
          )
          .bind(newId(), input.targetId, `${AUTO_HIDE_REPORTS} open reports`, nowIso()),
      ]);
      autoHidden = hide.meta.changes > 0;
    }
  }
  return { ok: true, duplicate, autoHidden };
}

export interface OpenReportGroup {
  target_type: "tool" | "comment";
  target_id: string;
  reports: { id: string; reason: string; note: string | null; created_at: string; reporter_name: string | null }[];
  tool?: { id: string; slug: string; name: string; status: string };
  comment?: CommentWithTool;
}

export async function listOpenReports(db: D1Database): Promise<OpenReportGroup[]> {
  const { results } = await db
    .prepare(`SELECT r.*, u.name AS reporter_name FROM report r LEFT JOIN "user" u ON u.id = r.reporter_id WHERE r.status = 'open' ORDER BY r.created_at ASC LIMIT 500`)
    .all<{ id: string; target_type: "tool" | "comment"; target_id: string; reason: string; note: string | null; created_at: string; reporter_name: string | null }>();
  const groups = new Map<string, OpenReportGroup>();
  for (const r of results) {
    const key = `${r.target_type}:${r.target_id}`;
    const g = groups.get(key) ?? { target_type: r.target_type, target_id: r.target_id, reports: [] };
    g.reports.push({ id: r.id, reason: r.reason, note: r.note, created_at: r.created_at, reporter_name: r.reporter_name });
    groups.set(key, g);
  }
  const list = [...groups.values()];
  const idsOf = (type: string) => list.filter((g) => g.target_type === type).map((g) => g.target_id);
  const marks = (n: number) => Array(n).fill("?").join(",");
  const toolIds = idsOf("tool");
  const commentIds = idsOf("comment");
  const [tools, comments] = await Promise.all([
    toolIds.length
      ? db.prepare(`SELECT id, slug, name, status FROM tool WHERE id IN (${marks(toolIds.length)})`).bind(...toolIds).all<{ id: string; slug: string; name: string; status: string }>()
      : { results: [] },
    commentIds.length ? db.prepare(`${COMMENT_SELECT} WHERE c.id IN (${marks(commentIds.length)})`).bind(...commentIds).all<CommentWithTool>() : { results: [] },
  ]);
  for (const g of list) {
    if (g.target_type === "tool") g.tool = tools.results.find((t) => t.id === g.target_id);
    else g.comment = comments.results.find((c) => c.id === g.target_id);
  }
  // Most-reported first, then oldest.
  return list.sort((a, b) => b.reports.length - a.reports.length || a.reports[0].created_at.localeCompare(b.reports[0].created_at));
}

export async function openReportCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(DISTINCT target_type || ':' || target_id) AS n FROM report WHERE status = 'open'`).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Closes every open report on a target after a moderator keeps or removes it. */
export async function closeReports(
  db: D1Database,
  targetType: "tool" | "comment",
  targetId: string,
  actorId: string,
  status: "resolved" | "dismissed",
  resolution: string,
): Promise<number> {
  const now = nowIso();
  const [res] = await db.batch([
    db
      .prepare(`UPDATE report SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE target_type = ? AND target_id = ? AND status = 'open'`)
      .bind(status, resolution, actorId, now, targetType, targetId),
    db
      .prepare(`INSERT INTO moderation_event (id, tool_id, comment_id, actor_id, action, reason, created_at) SELECT ?,?,?,?,?,?,? WHERE changes() > 0`)
      .bind(
        newId(),
        targetType === "tool" ? targetId : null,
        targetType === "comment" ? targetId : null,
        actorId,
        status === "dismissed" ? "dismiss_reports" : "resolve_reports",
        resolution,
        now,
      ),
  ]);
  return res.meta.changes ?? 0;
}

// ---------- Roles ----------

export interface UserRow {
  id: string;
  name: string;
  email: string;
  handle: string | null;
  role: string;
  created_at: string;
}

export async function findUsers(db: D1Database, q: string): Promise<UserRow[]> {
  const base = `SELECT id, name, email, handle, role, "createdAt" AS created_at FROM "user"`;
  if (!q) {
    const { results } = await db.prepare(`${base} WHERE role != 'user' ORDER BY role, name LIMIT 100`).all<UserRow>();
    return results;
  }
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { results } = await db
    .prepare(`${base} WHERE email LIKE ?1 ESCAPE '\\' OR handle LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' ORDER BY "createdAt" DESC LIMIT 50`)
    .bind(like)
    .all<UserRow>();
  return results;
}

export async function getUserRole(db: D1Database, id: string): Promise<{ id: string; role: string } | null> {
  return db.prepare(`SELECT id, role FROM "user" WHERE id = ?`).bind(id).first();
}

export async function setUserRole(db: D1Database, target: { id: string; role: string }, actorId: string, to: string, reason: string | null): Promise<boolean> {
  const [res] = await db.batch([
    db.prepare(`UPDATE "user" SET role = ?, "updatedAt" = ? WHERE id = ? AND role = ?`).bind(to, nowIso(), target.id, target.role),
    db
      .prepare(
        `INSERT INTO moderation_event (id, subject_user_id, actor_id, action, from_status, to_status, reason, created_at)
         SELECT ?,?,?,'set_role',?,?,?,? WHERE changes() > 0`,
      )
      .bind(newId(), target.id, actorId, target.role, to, reason, nowIso()),
  ]);
  return res.meta.changes > 0;
}

export async function roleHistory(db: D1Database, limit = 30) {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.from_status, e.to_status, e.reason, e.created_at, a.name AS actor_name, s.name AS subject_name, s.email AS subject_email
       FROM moderation_event e LEFT JOIN "user" a ON a.id = e.actor_id LEFT JOIN "user" s ON s.id = e.subject_user_id
       WHERE e.action = 'set_role' ORDER BY e.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; from_status: string; to_status: string; reason: string | null; created_at: string; actor_name: string | null; subject_name: string | null; subject_email: string | null }>();
  return results;
}

// ---------- Collections and featured (admin) ----------

export interface CollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string;
  tool_count?: number;
}

export async function listAllCollections(db: D1Database): Promise<CollectionRow[]> {
  const { results } = await db
    .prepare(`SELECT c.*, (SELECT COUNT(*) FROM collection_tool ct WHERE ct.collection_id = c.id) AS tool_count FROM collection c ORDER BY c.updated_at DESC`)
    .all<CollectionRow>();
  return results;
}

export async function getCollectionForEdit(db: D1Database, id: string) {
  const c = await db.prepare(`SELECT * FROM collection WHERE id = ?`).bind(id).first<CollectionRow>();
  if (!c) return null;
  const { results } = await db
    .prepare(
      `SELECT t.id, t.slug, t.name, t.status, ct.position, ct.note FROM collection_tool ct JOIN tool t ON t.id = ct.tool_id
       WHERE ct.collection_id = ? ORDER BY ct.position, t.name`,
    )
    .bind(id)
    .all<{ id: string; slug: string; name: string; status: string; position: number; note: string | null }>();
  return { ...c, tools: results };
}

function collectionAudit(db: D1Database, collectionId: string, actorId: string, action: string, reason: string | null) {
  return db
    .prepare(`INSERT INTO moderation_event (id, collection_id, actor_id, action, reason, created_at) VALUES (?,?,?,?,?,?)`)
    .bind(newId(), collectionId, actorId, action, reason, nowIso());
}

export async function saveCollection(
  db: D1Database,
  actorId: string,
  input: { id?: string; slug: string; title: string; description: string; status: "draft" | "published" },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const clash = await db.prepare(`SELECT 1 FROM collection WHERE slug = ? AND id != ?`).bind(input.slug, input.id ?? "").first();
  if (clash) return { ok: false, error: "Another collection already uses that URL." };
  const now = nowIso();
  if (!input.id) {
    const id = newId();
    await db.batch([
      db
        .prepare(`INSERT INTO collection (id, slug, title, description, status, published_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(id, input.slug, input.title, input.description, input.status, input.status === "published" ? now : null, now),
      collectionAudit(db, id, actorId, "collection_create", input.title),
    ]);
    return { ok: true, id };
  }
  const [res] = await db.batch([
    db
      .prepare(
        `UPDATE collection SET slug = ?, title = ?, description = ?, status = ?, updated_at = ?,
           published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
         WHERE id = ?`,
      )
      .bind(input.slug, input.title, input.description, input.status, now, input.status, now, input.id),
    collectionAudit(db, input.id, actorId, "collection_edit", `${input.status}: ${input.title}`),
  ]);
  return res.meta.changes ? { ok: true, id: input.id } : { ok: false, error: "Collection not found." };
}

export async function addToCollection(db: D1Database, actorId: string, collectionId: string, toolSlug: string, note: string | null): Promise<string | null> {
  const tool = await db.prepare(`SELECT id, name FROM tool WHERE slug = ?`).bind(toolSlug).first<{ id: string; name: string }>();
  if (!tool) return "No tool with that slug.";
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO collection_tool (collection_id, tool_id, position, note)
       SELECT ?, ?, COALESCE((SELECT MAX(position) + 1 FROM collection_tool WHERE collection_id = ?), 0), ?
       WHERE EXISTS (SELECT 1 FROM collection WHERE id = ?)`,
    )
    .bind(collectionId, tool.id, collectionId, note, collectionId)
    .run();
  if (!res.meta.changes) return "That tool is already in this collection.";
  await db.batch([
    db.prepare(`UPDATE collection SET updated_at = ? WHERE id = ?`).bind(nowIso(), collectionId),
    collectionAudit(db, collectionId, actorId, "collection_add", tool.name),
  ]);
  return null;
}

export async function removeFromCollection(db: D1Database, actorId: string, collectionId: string, toolId: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM collection_tool WHERE collection_id = ? AND tool_id = ?`).bind(collectionId, toolId),
    db.prepare(`UPDATE collection SET updated_at = ? WHERE id = ?`).bind(nowIso(), collectionId),
    collectionAudit(db, collectionId, actorId, "collection_remove", toolId),
  ]);
}

/** Moves a tool one place by renumbering the whole list, so gaps and ties never build up. */
export async function moveInCollection(db: D1Database, collectionId: string, toolId: string, dir: -1 | 1): Promise<void> {
  const { results } = await db
    .prepare(`SELECT tool_id FROM collection_tool WHERE collection_id = ? ORDER BY position, rowid`)
    .bind(collectionId)
    .all<{ tool_id: string }>();
  const order = results.map((r) => r.tool_id);
  const i = order.indexOf(toolId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  await db.batch(order.map((id, pos) => db.prepare(`UPDATE collection_tool SET position = ? WHERE collection_id = ? AND tool_id = ?`).bind(pos, collectionId, id)));
}

/** featured > 0 puts a published tool in the home slideshow, ordered by that number; 0 takes it out. */
export async function setFeatured(db: D1Database, toolId: string, actorId: string, position: number): Promise<boolean> {
  const [res] = await db.batch([
    db.prepare(`UPDATE tool SET featured = ?, updated_at = ? WHERE id = ?`).bind(position, nowIso(), toolId),
    db
      .prepare(`INSERT INTO moderation_event (id, tool_id, actor_id, action, reason, created_at) SELECT ?,?,?,?,?,? WHERE changes() > 0`)
      .bind(newId(), toolId, actorId, position > 0 ? "feature" : "unfeature", position > 0 ? `position ${position}` : null, nowIso()),
  ]);
  return res.meta.changes > 0;
}

// ---------- Account deletion ----------

/** Deletes an account and what hangs off it (sessions, logins, saves, hearts, submissions). Published
 * listings stay without the name; comments are blanked, not removed, so replies keep their place. */
/** On success, `avatar` is the uploaded photo (if any) the caller should delete from R2. */
export async function deleteAccount(
  db: D1Database,
  userId: string,
  email: string,
): Promise<{ ok: true; avatar: string | null; uploads: string[] } | { ok: false; error: string }> {
  const me = await db.prepare(`SELECT role, avatar FROM "user" WHERE id = ?`).bind(userId).first<{ role: string; avatar: string | null }>();
  if (!me) return { ok: false, error: "Account not found." };
  if (me.role === "admin") {
    const admins = await db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE role = 'admin'`).first<{ n: number }>();
    if ((admins?.n ?? 0) <= 1) return { ok: false, error: "You're the only admin. Make someone else an admin first." };
  }
  // Submissions go with the account (ON DELETE CASCADE); covers already on a published tool stay with it.
  const { results: uploads } = await db
    .prepare(`SELECT s.image_key FROM submission s WHERE s.user_id = ? AND s.image_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tool t WHERE t.image_key = s.image_key)`)
    .bind(userId)
    .all<{ image_key: string }>();
  await db.batch([
    db.prepare(`UPDATE comment SET body = '', status = 'deleted', user_id = NULL WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM verification WHERE identifier LIKE ?`).bind(`%${email.toLowerCase()}`),
    db.prepare(`DELETE FROM "user" WHERE id = ?`).bind(userId),
  ]);
  return { ok: true, avatar: me.avatar, uploads: uploads.map((r) => r.image_key) };
}

// ---------- Maker verification ----------

export async function getMakerClaim(db: D1Database, slug: string) {
  return db
    .prepare(`SELECT id, slug, name, url, status, submitted_by, credit_type, maker_verified_at FROM tool WHERE slug = ?`)
    .bind(slug)
    .first<{ id: string; slug: string; name: string; url: string; status: string; submitted_by: string | null; credit_type: string | null; maker_verified_at: string | null }>();
}

export async function markMakerVerified(db: D1Database, toolId: string, userId: string, method: string): Promise<boolean> {
  const now = nowIso();
  const [res] = await db.batch([
    db
      .prepare(`UPDATE tool SET maker_verified_at = ?, updated_at = ? WHERE id = ? AND submitted_by = ? AND credit_type = 'made' AND maker_verified_at IS NULL`)
      .bind(now, now, toolId, userId),
    db
      .prepare(`INSERT INTO moderation_event (id, tool_id, actor_id, action, reason, created_at) SELECT ?,?,?,'maker_verified',?,? WHERE changes() > 0`)
      .bind(newId(), toolId, userId, `proof: ${method}`, now),
  ]);
  return res.meta.changes > 0;
}

/**
 * A maker takes over an editorial listing after proving control of its site. Only unowned editorial
 * tools qualify, so a claim can never take a listing away from whoever submitted it.
 */
export async function claimEditorialTool(db: D1Database, toolId: string, userId: string, method: string): Promise<boolean> {
  const now = nowIso();
  const [res] = await db.batch([
    db
      .prepare(
        `UPDATE tool SET submitted_by = ?, credit_type = 'made', maker_verified_at = ?, updated_at = ?
         WHERE id = ? AND status = 'published' AND credit_type = 'editorial' AND submitted_by IS NULL`,
      )
      .bind(userId, now, now, toolId),
    db
      .prepare(`INSERT INTO moderation_event (id, tool_id, actor_id, action, reason, created_at) SELECT ?,?,?,'maker_claimed',?,? WHERE changes() > 0`)
      .bind(newId(), toolId, userId, `proof: ${method}`, now),
  ]);
  return res.meta.changes > 0;
}

// ---------- Site analytics (/admin/stats) ----------

export interface PageViewInput {
  day: string;
  path: string;
  /** First page this visitor loaded today: counts them as a visitor, with source and country. */
  firstOfDay: boolean;
  mobile: boolean;
  source: string;
  country: string;
}

export async function recordPageView(db: D1Database, v: PageViewInput): Promise<void> {
  const first = v.firstOfDay ? 1 : 0;
  const writes = [
    db
      .prepare(
        `INSERT INTO site_stat_daily (day, views, visitors, mobile_visitors) VALUES (?1, 1, ?2, ?3)
         ON CONFLICT(day) DO UPDATE SET views = views + 1, visitors = visitors + ?2, mobile_visitors = mobile_visitors + ?3`,
      )
      .bind(v.day, first, first && v.mobile ? 1 : 0),
    db
      .prepare(`INSERT INTO page_stat_daily (day, path, views) VALUES (?1, ?2, 1) ON CONFLICT(day, path) DO UPDATE SET views = views + 1`)
      .bind(v.day, v.path),
  ];
  if (v.firstOfDay) {
    writes.push(
      db
        .prepare(`INSERT INTO source_stat_daily (day, source, visitors) VALUES (?1, ?2, 1) ON CONFLICT(day, source) DO UPDATE SET visitors = visitors + 1`)
        .bind(v.day, v.source),
      db
        .prepare(`INSERT INTO country_stat_daily (day, country, visitors) VALUES (?1, ?2, 1) ON CONFLICT(day, country) DO UPDATE SET visitors = visitors + 1`)
        .bind(v.day, v.country),
    );
  }
  await db.batch(writes);
}

export async function markUserActive(db: D1Database, userId: string, day: string): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO user_active_day (user_id, day) VALUES (?, ?)`).bind(userId, day).run();
}

export async function pruneUserActivity(db: D1Database, before: string): Promise<void> {
  await db.prepare(`DELETE FROM user_active_day WHERE day < ?`).bind(before).run();
}

export async function recordSearch(db: D1Database, day: string, term: string): Promise<void> {
  await db
    .prepare(`INSERT INTO search_stat_daily (day, term, searches) VALUES (?1, ?2, 1) ON CONFLICT(day, term) DO UPDATE SET searches = searches + 1`)
    .bind(day, term)
    .run();
}

export async function pruneSearchStats(db: D1Database, before: string): Promise<void> {
  await db.prepare(`DELETE FROM search_stat_daily WHERE day < ?`).bind(before).run();
}

export interface SearchRow {
  term: string;
  searches: number;
  /** Published tools the term matches right now, not when it was searched. */
  results: number;
  /** Set when the term is also a tag with its own page. */
  tag: string | null;
}

/** Most searched /explore terms in the range, with today's result count so dead ends stand out. */
export async function topSearches(db: D1Database, from: string, to: string, limit = 20): Promise<SearchRow[]> {
  const { results } = await db
    .prepare(`SELECT term, SUM(searches) AS searches FROM search_stat_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY term ORDER BY searches DESC, term LIMIT ?3`)
    .bind(from, to, limit)
    .all<{ term: string; searches: number }>();
  return Promise.all(
    results.map(async (r) => {
      const tag = parseTags(r.term)[0] === r.term ? r.term : null;
      const [n, tagged] = await Promise.all([countTools(db, { q: r.term }), tag ? countTools(db, { tag }) : 0]);
      return { ...r, results: n, tag: tagged ? tag : null };
    }),
  );
}

export interface StatTotals {
  visitors: number;
  pageViews: number;
  mobileVisitors: number;
  toolViews: number;
  tries: number;
  tryers: number;
  impressions: number;
  hearts: number;
  saves: number;
  newUsers: number;
  submissions: number;
  approved: number;
  comments: number;
  reports: number;
}

/** Totals for an inclusive day range. Timestamps are ISO strings, so `< next day` compares as text. */
export async function statTotals(db: D1Database, from: string, to: string): Promise<StatTotals> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COALESCE(SUM(visitors), 0) FROM site_stat_daily WHERE day BETWEEN ?1 AND ?2) AS visitors,
        (SELECT COALESCE(SUM(views), 0) FROM site_stat_daily WHERE day BETWEEN ?1 AND ?2) AS pageViews,
        (SELECT COALESCE(SUM(mobile_visitors), 0) FROM site_stat_daily WHERE day BETWEEN ?1 AND ?2) AS mobileVisitors,
        (SELECT COALESCE(SUM(views), 0) FROM tool_stat_daily WHERE day BETWEEN ?1 AND ?2) AS toolViews,
        (SELECT COALESCE(SUM(tries), 0) FROM tool_stat_daily WHERE day BETWEEN ?1 AND ?2) AS tries,
        (SELECT COALESCE(SUM(tryers), 0) FROM site_stat_daily WHERE day BETWEEN ?1 AND ?2) AS tryers,
        (SELECT COALESCE(SUM(impressions), 0) FROM surface_stat_daily WHERE day BETWEEN ?1 AND ?2) AS impressions,
        (SELECT COUNT(*) FROM tool_like WHERE created_at >= ?1 AND created_at < date(?2, '+1 day')) AS hearts,
        (SELECT COUNT(*) FROM bookmark WHERE created_at >= ?1 AND created_at < date(?2, '+1 day')) AS saves,
        (SELECT COUNT(*) FROM "user" WHERE createdAt >= ?1 AND createdAt < date(?2, '+1 day')) AS newUsers,
        (SELECT COUNT(*) FROM submission WHERE created_at >= ?1 AND created_at < date(?2, '+1 day')) AS submissions,
        (SELECT COUNT(*) FROM moderation_event WHERE to_status = 'published' AND submission_id IS NOT NULL AND created_at >= ?1 AND created_at < date(?2, '+1 day')) AS approved,
        (SELECT COUNT(*) FROM comment WHERE created_at >= ?1 AND created_at < date(?2, '+1 day')) AS comments,
        (SELECT COUNT(*) FROM report WHERE created_at >= ?1 AND created_at < date(?2, '+1 day')) AS reports`,
    )
    .bind(from, to)
    .first<StatTotals>();
  return row!;
}

export interface DailyRow {
  day: string;
  visitors: number;
  pageViews: number;
  toolViews: number;
  tries: number;
}

/** One row per day in the range, zero-filled. */
export async function statDaily(db: D1Database, days: string[]): Promise<DailyRow[]> {
  const [from, to] = [days[0], days[days.length - 1]];
  const [site, tools] = await Promise.all([
    db.prepare(`SELECT day, visitors, views FROM site_stat_daily WHERE day BETWEEN ? AND ?`).bind(from, to).all<{ day: string; visitors: number; views: number }>(),
    db
      .prepare(`SELECT day, SUM(views) AS views, SUM(tries) AS tries FROM tool_stat_daily WHERE day BETWEEN ? AND ? GROUP BY day`)
      .bind(from, to)
      .all<{ day: string; views: number; tries: number }>(),
  ]);
  const s = new Map(site.results.map((r) => [r.day, r]));
  const t = new Map(tools.results.map((r) => [r.day, r]));
  return days.map((day) => ({
    day,
    visitors: s.get(day)?.visitors ?? 0,
    pageViews: s.get(day)?.views ?? 0,
    toolViews: t.get(day)?.views ?? 0,
    tries: t.get(day)?.tries ?? 0,
  }));
}

export interface TopTool {
  slug: string;
  name: string;
  views: number;
  tries: number;
  hearts: number;
  saves: number;
}

export async function topTools(db: D1Database, from: string, to: string, limit = 10): Promise<TopTool[]> {
  const { results } = await db
    .prepare(
      `SELECT t.slug, t.name,
        COALESCE(s.views, 0) AS views, COALESCE(s.tries, 0) AS tries,
        (SELECT COUNT(*) FROM tool_like l WHERE l.tool_id = t.id AND l.created_at >= ?1 AND l.created_at < date(?2, '+1 day')) AS hearts,
        (SELECT COUNT(*) FROM bookmark b WHERE b.tool_id = t.id AND b.created_at >= ?1 AND b.created_at < date(?2, '+1 day')) AS saves
       FROM tool t
       JOIN (SELECT tool_id, SUM(views) AS views, SUM(tries) AS tries FROM tool_stat_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY tool_id) s ON s.tool_id = t.id
       ORDER BY s.tries DESC, s.views DESC, t.name
       LIMIT ?3`,
    )
    .bind(from, to, limit)
    .all<TopTool>();
  return results;
}

export interface SurfaceRow {
  surface: string;
  impressions: number;
  views: number;
  tries: number;
}

/** Impressions, views and tries per discovery surface; collections are grouped into one row here. */
export async function surfaceStats(db: D1Database, from: string, to: string): Promise<SurfaceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT CASE WHEN surface LIKE 'collection:%' THEN 'collection' ELSE surface END AS surface,
         SUM(impressions) AS impressions, SUM(views) AS views, SUM(tries) AS tries
       FROM surface_stat_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY 1 ORDER BY tries DESC, views DESC, impressions DESC`,
    )
    .bind(from, to)
    .all<SurfaceRow>();
  return results;
}

export interface CollectionStat {
  slug: string;
  title: string;
  pageViews: number;
  views: number;
  tries: number;
  /** Visitor-days that saw or opened a tool in the collection, and that clicked Try from it (funnel era only). */
  engaged: number;
  tried: number;
}

/** Each published collection: visits to its page, and the tool views and tries that started there. */
export async function collectionStats(db: D1Database, from: string, to: string): Promise<CollectionStat[]> {
  const { results } = await db
    .prepare(
      `SELECT c.slug, c.title,
         (SELECT COALESCE(SUM(p.views), 0) FROM page_stat_daily p WHERE p.path = '/collections/' || c.slug AND p.day BETWEEN ?1 AND ?2) AS pageViews,
         (SELECT COALESCE(SUM(s.views), 0) FROM surface_stat_daily s WHERE s.surface = 'collection:' || c.slug AND s.day BETWEEN ?1 AND ?2) AS views,
         (SELECT COALESCE(SUM(s.tries), 0) FROM surface_stat_daily s WHERE s.surface = 'collection:' || c.slug AND s.day BETWEEN ?1 AND ?2) AS tries,
         (SELECT COALESCE(SUM(f.engaged), 0) FROM funnel_surface_daily f WHERE f.surface = 'collection:' || c.slug AND f.day BETWEEN ?1 AND ?2) AS engaged,
         (SELECT COALESCE(SUM(f.tried), 0) FROM funnel_surface_daily f WHERE f.surface = 'collection:' || c.slug AND f.day BETWEEN ?1 AND ?2) AS tried
       FROM collection c WHERE c.status = 'published' ORDER BY pageViews DESC, tries DESC, c.published_at DESC`,
    )
    .bind(from, to)
    .all<CollectionStat>();
  return results;
}

export interface QuietTool {
  slug: string;
  name: string;
  impressions: number;
  tries: number;
}

/** Tools people scrolled past: seen on screen at least `min` times, lowest try rate first. */
export async function quietTools(db: D1Database, from: string, to: string, min = 50, limit = 10): Promise<QuietTool[]> {
  const { results } = await db
    .prepare(
      `SELECT t.slug, t.name, SUM(s.impressions) AS impressions, SUM(s.tries) AS tries
       FROM surface_stat_daily s JOIN tool t ON t.id = s.tool_id AND t.status = 'published'
       WHERE s.day BETWEEN ?1 AND ?2 GROUP BY s.tool_id HAVING SUM(s.impressions) >= ?3
       ORDER BY CAST(SUM(s.tries) AS REAL) / SUM(s.impressions), SUM(s.impressions) DESC LIMIT ?4`,
    )
    .bind(from, to, min, limit)
    .all<QuietTool>();
  return results;
}

export interface Ranked {
  key: string;
  count: number;
}

const BREAKDOWNS = {
  pages: `SELECT path AS key, SUM(views) AS count FROM page_stat_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY path ORDER BY count DESC, key LIMIT ?3`,
  sources: `SELECT source AS key, SUM(visitors) AS count FROM source_stat_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY source ORDER BY count DESC, key LIMIT ?3`,
  countries: `SELECT country AS key, SUM(visitors) AS count FROM country_stat_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY country ORDER BY count DESC, key LIMIT ?3`,
} as const;

export async function statBreakdown(db: D1Database, kind: keyof typeof BREAKDOWNS, from: string, to: string, limit = 10): Promise<Ranked[]> {
  const { results } = await db.prepare(BREAKDOWNS[kind]).bind(from, to, limit).all<Ranked>();
  return results;
}

export interface Cohort {
  week: string; // Monday, YYYY-MM-DD
  size: number;
  /** Share of the cohort active in week 1..4 after the signup week; null until that week has ended. */
  weeks: (number | null)[];
}

/** Weekly signup cohorts (Monday-based, UTC) and how many came back in each following week. */
export async function retentionCohorts(db: D1Database, weeks = 8, now = Date.now()): Promise<Cohort[]> {
  const today = new Date(now).toISOString().slice(0, 10);
  const { results } = await db
    .prepare(
      `WITH cohort AS (
         SELECT id, date(createdAt, 'weekday 0', '-6 days') AS week FROM "user"
         WHERE createdAt >= date(?1, 'weekday 0', ?2) AND role = 'user'
       )
       SELECT c.week, COUNT(DISTINCT c.id) AS size,
         COUNT(DISTINCT CASE WHEN a.day >= date(c.week, '+7 days') AND a.day < date(c.week, '+14 days') THEN c.id END) AS w1,
         COUNT(DISTINCT CASE WHEN a.day >= date(c.week, '+14 days') AND a.day < date(c.week, '+21 days') THEN c.id END) AS w2,
         COUNT(DISTINCT CASE WHEN a.day >= date(c.week, '+21 days') AND a.day < date(c.week, '+28 days') THEN c.id END) AS w3,
         COUNT(DISTINCT CASE WHEN a.day >= date(c.week, '+28 days') AND a.day < date(c.week, '+35 days') THEN c.id END) AS w4
       FROM cohort c LEFT JOIN user_active_day a ON a.user_id = c.id
       GROUP BY c.week ORDER BY c.week DESC`,
    )
    .bind(today, `-${weeks * 7 - 1} days`)
    .all<{ week: string; size: number; w1: number; w2: number; w3: number; w4: number }>();
  return results.map((r) => ({
    week: r.week,
    size: r.size,
    weeks: [r.w1, r.w2, r.w3, r.w4].map((n, i) => {
      const ended = new Date(Date.parse(r.week) + (i + 2) * 7 * 86400000).toISOString().slice(0, 10);
      return ended <= today ? n / r.size : null;
    }),
  }));
}

// ---------- Sign-in methods ----------

export interface SignInAccount {
  /** Row id: what Better Auth's unlink-account expects as "accountId" (not the provider's user id). */
  id: string;
  providerId: string;
  accountId: string;
  createdAt: string;
}

export async function listSignInAccounts(db: D1Database, userId: string): Promise<SignInAccount[]> {
  const { results } = await db
    .prepare(`SELECT id, "providerId" AS providerId, "accountId" AS accountId, "createdAt" AS createdAt FROM "account" WHERE "userId" = ? ORDER BY "createdAt"`)
    .bind(userId)
    .all<SignInAccount>();
  return results;
}

// ---------- Product updates ----------

export interface ToolUpdate {
  id: string;
  tool_id: string;
  user_id: string | null;
  note: string;
  tagline: string;
  try_this: string;
  why: string;
  status: "pending" | "published" | "rejected" | "withdrawn";
  resurfaced: number;
  moderator_note: string | null;
  created_at: string;
  decided_at: string | null;
}

/** What the update form needs: updates sent in the rate window and the one still waiting, if any. */
export async function updateContext(db: D1Database, toolId: string): Promise<{ recent: number; pending: ToolUpdate | null; last: ToolUpdate | null }> {
  const since = new Date(Date.now() - UPDATE_WINDOW_DAYS * 86400000).toISOString();
  const [recent, last] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM tool_update WHERE tool_id = ? AND created_at >= ? AND status != 'withdrawn'`).bind(toolId, since).first<{ n: number }>(),
    db.prepare(`SELECT * FROM tool_update WHERE tool_id = ? ORDER BY created_at DESC LIMIT 1`).bind(toolId).first<ToolUpdate>(),
  ]);
  return { recent: recent?.n ?? 0, pending: last?.status === "pending" ? last : null, last };
}

export async function createToolUpdate(db: D1Database, toolId: string, userId: string, input: ToolUpdateInput): Promise<boolean> {
  const id = newId();
  try {
    await db.batch([
      db
        .prepare(`INSERT INTO tool_update (id, tool_id, user_id, note, tagline, try_this, why, created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(id, toolId, userId, input.note, input.tagline, input.tryThis, input.why, nowIso()),
      updateAudit(db, id, toolId, userId, "update_submit", null, "pending", input.note),
    ]);
    return true;
  } catch {
    // The one-pending-per-tool index caught a double submit.
    return false;
  }
}

export async function withdrawToolUpdate(db: D1Database, update: ToolUpdate, userId: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE tool_update SET status = 'withdrawn', decided_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'`).bind(nowIso(), update.id, userId),
    updateAudit(db, update.id, update.tool_id, userId, "update_withdraw", "pending", "withdrawn", null),
  ]);
}

function updateAudit(db: D1Database, updateId: string, toolId: string, actorId: string, action: string, from: string | null, to: string, reason: string | null) {
  return db
    .prepare(`INSERT INTO moderation_event (id, tool_id, update_id, actor_id, action, from_status, to_status, reason, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(newId(), toolId, updateId, actorId, action, from, to, reason, nowIso());
}

export type PendingUpdate = ToolUpdate & {
  slug: string;
  name: string;
  old_tagline: string;
  old_try_this: string;
  old_why: string;
  refreshed_at: string | null;
  submitter_name: string | null;
};

export async function pendingUpdates(db: D1Database): Promise<PendingUpdate[]> {
  const { results } = await db
    .prepare(
      `SELECT u.*, t.slug, t.name, t.tagline AS old_tagline, t.try_this AS old_try_this, t.why AS old_why, t.refreshed_at, p.name AS submitter_name
       FROM tool_update u JOIN tool t ON t.id = u.tool_id LEFT JOIN "user" p ON p.id = u.user_id
       WHERE u.status = 'pending' ORDER BY u.created_at ASC LIMIT 100`,
    )
    .all<PendingUpdate>();
  return results;
}

export async function pendingUpdateCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM tool_update WHERE status = 'pending'`).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Approves (copying the text onto the tool) or declines a pending update. The tool write is guarded on this decision
 * having won, so two moderators deciding at once can't both apply; the resurface cooldown is enforced in SQL too.
 */
export async function decideToolUpdate(
  db: D1Database,
  updateId: string,
  actor: { id: string; role: string },
  decision: { approve: boolean; resurface: boolean; note: string | null },
): Promise<string | null> {
  const u = await db.prepare(`SELECT * FROM tool_update WHERE id = ?`).bind(updateId).first<ToolUpdate>();
  if (!u || u.status !== "pending") return "This update was already decided.";
  // Same rule as submissions: admins may approve their own, moderators may not.
  if (u.user_id === actor.id && actor.role !== "admin") return "Another moderator has to review your own update.";
  const now = nowIso();
  const to = decision.approve ? "published" : "rejected";
  const resurface = decision.approve && decision.resurface ? 1 : 0;
  const cutoff = new Date(Date.now() - RESURFACE_COOLDOWN_DAYS * 86400000).toISOString();
  const stmts = [
    db
      .prepare(`UPDATE tool_update SET status = ?, resurfaced = ?, moderator_note = ?, decided_at = ? WHERE id = ? AND status = 'pending'`)
      .bind(to, resurface, decision.note, now, u.id),
  ];
  if (decision.approve) {
    stmts.push(
      db
        .prepare(
          `UPDATE tool SET tagline = ?, try_this = ?, why = ?, updated_at = ?,
             refreshed_at = CASE WHEN ? = 1 AND (refreshed_at IS NULL OR refreshed_at <= ?) THEN ? ELSE refreshed_at END
           WHERE id = ? AND EXISTS (SELECT 1 FROM tool_update WHERE id = ? AND status = 'published' AND decided_at = ?)`,
        )
        .bind(u.tagline, u.try_this, u.why, now, resurface, cutoff, now, u.tool_id, u.id, now),
    );
  }
  stmts.push(updateAudit(db, u.id, u.tool_id, actor.id, decision.approve ? "update_approve" : "update_reject", "pending", to, decision.note));
  const [res] = await db.batch(stmts);
  return res.meta.changes ? null : "This update was already decided.";
}

/** Approved updates for a tool page, newest first. */
export async function publishedUpdates(db: D1Database, toolId: string, limit = 5): Promise<{ id: string; note: string; decided_at: string }[]> {
  const { results } = await db
    .prepare(`SELECT id, note, decided_at FROM tool_update WHERE tool_id = ? AND status = 'published' ORDER BY decided_at DESC LIMIT ?`)
    .bind(toolId, limit)
    .all<{ id: string; note: string; decided_at: string }>();
  return results;
}

// ---------- Discovery funnel (visitor-days) ----------

export type FunnelStepKey = "engaged" | "tried";

/** Opens today's funnel row on a visitor's first counted page load. False when they already have one. */
export async function startVisit(db: D1Database, visitor: string, day: string, a: Acquisition): Promise<boolean> {
  const res = await db
    .prepare(`INSERT OR IGNORE INTO visit_day (visitor, day, source, medium, campaign) VALUES (?, ?, ?, ?, ?)`)
    .bind(visitor, day, a.source, a.medium, a.campaign)
    .run();
  if (!res.meta.changes) return false;
  await db
    .prepare(
      `INSERT INTO funnel_source_daily (day, source, medium, campaign, visits) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(day, source, medium, campaign) DO UPDATE SET visits = visits + 1`,
    )
    .bind(day, a.source, a.medium, a.campaign)
    .run();
  return true;
}

/**
 * Marks a step for a visitor with a visit today. The guarded UPDATE is what de-duplicates: only the beacon that
 * flips the flag adds to the source totals. "none" means no counted page load today, so the funnel skips them.
 */
export async function markVisitStep(db: D1Database, visitor: string, step: FunnelStepKey): Promise<"counted" | "already" | "none"> {
  const row = await db
    .prepare(`UPDATE visit_day SET ${step} = 1 WHERE visitor = ? AND ${step} = 0 RETURNING day, source, medium, campaign`)
    .bind(visitor)
    .first<{ day: string; source: string; medium: string; campaign: string }>();
  if (row) {
    await db
      .prepare(`UPDATE funnel_source_daily SET ${step} = ${step} + 1 WHERE day = ? AND source = ? AND medium = ? AND campaign = ?`)
      .bind(row.day, row.source, row.medium, row.campaign)
      .run();
    return "counted";
  }
  return (await db.prepare(`SELECT 1 FROM visit_day WHERE visitor = ?`).bind(visitor).first()) ? "already" : "none";
}

/** One more visitor-day for a surface's step; the caller de-duplicates per visitor and surface. */
export async function bumpSurfaceFunnel(db: D1Database, day: string, surface: string, step: FunnelStepKey): Promise<void> {
  await db
    .prepare(`INSERT INTO funnel_surface_daily (day, surface, ${step}) VALUES (?, ?, 1) ON CONFLICT(day, surface) DO UPDATE SET ${step} = ${step} + 1`)
    .bind(day, surface)
    .run();
}

export async function pruneVisits(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM visit_day WHERE day < date('now', '-1 day')`).run();
}

export interface FunnelTotals {
  /** First day with funnel data, or null if none yet. */
  since: string | null;
  visits: number;
  engaged: number;
  tried: number;
}

export async function funnelTotals(db: D1Database, from: string, to: string): Promise<FunnelTotals> {
  const row = await db
    .prepare(
      `SELECT (SELECT MIN(day) FROM funnel_source_daily) AS since,
         COALESCE(SUM(visits), 0) AS visits, COALESCE(SUM(engaged), 0) AS engaged, COALESCE(SUM(tried), 0) AS tried
       FROM funnel_source_daily WHERE day BETWEEN ?1 AND ?2`,
    )
    .bind(from, to)
    .first<FunnelTotals>();
  return row!;
}

export interface SourceFunnel {
  source: string;
  medium: string;
  campaign: string;
  visits: number;
  engaged: number;
  tried: number;
}

export async function sourceFunnel(db: D1Database, from: string, to: string, limit = 15): Promise<SourceFunnel[]> {
  const { results } = await db
    .prepare(
      `SELECT source, medium, campaign, SUM(visits) AS visits, SUM(engaged) AS engaged, SUM(tried) AS tried
       FROM funnel_source_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY source, medium, campaign
       ORDER BY visits DESC, tried DESC, source LIMIT ?3`,
    )
    .bind(from, to, limit)
    .all<SourceFunnel>();
  return results;
}

/** Unique visitor-days per surface (collections grouped), keyed by surface. */
export async function surfaceFunnel(db: D1Database, from: string, to: string): Promise<Map<string, { engaged: number; tried: number }>> {
  const { results } = await db
    .prepare(
      `SELECT CASE WHEN surface LIKE 'collection:%' THEN 'collection' ELSE surface END AS surface, SUM(engaged) AS engaged, SUM(tried) AS tried
       FROM funnel_surface_daily WHERE day BETWEEN ?1 AND ?2 GROUP BY 1`,
    )
    .bind(from, to)
    .all<{ surface: string; engaged: number; tried: number }>();
  return new Map(results.map((r) => [r.surface, r]));
}

export interface MakerValue {
  verifiedMakers: number;
  withTries: number;
  withSaves: number;
}

/** Only verified "I made this" listings count: elsewhere the person credited may not own the product. */
export async function makerValue(db: D1Database, from: string, to: string): Promise<MakerValue> {
  const row = await db
    .prepare(
      `WITH m AS (SELECT id, submitted_by FROM tool WHERE status = 'published' AND credit_type = 'made' AND maker_verified_at IS NOT NULL AND submitted_by IS NOT NULL)
       SELECT
         (SELECT COUNT(DISTINCT submitted_by) FROM m) AS verifiedMakers,
         (SELECT COUNT(DISTINCT m.submitted_by) FROM m JOIN tool_stat_daily s ON s.tool_id = m.id WHERE s.day BETWEEN ?1 AND ?2 AND s.tries > 0) AS withTries,
         (SELECT COUNT(DISTINCT m.submitted_by) FROM m JOIN bookmark b ON b.tool_id = m.id WHERE b.created_at >= ?1 AND b.created_at < date(?2, '+1 day')) AS withSaves`,
    )
    .bind(from, to)
    .first<MakerValue>();
  return row!;
}

// ---------- Feedback ----------

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  status: "new" | "done";
  created_at: string;
  user_name: string | null;
  user_handle: string | null;
  /** Shown to moderators only, so they can reply. */
  user_email: string | null;
}

export async function createFeedback(db: D1Database, input: FeedbackInput, userId: string | null): Promise<void> {
  await db
    .prepare(`INSERT INTO feedback (id, kind, message, page, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(newId(), input.kind, input.message, input.page, userId, nowIso())
    .run();
}

export async function listFeedback(db: D1Database, status: "new" | "done", limit = 100): Promise<FeedbackRow[]> {
  const { results } = await db
    .prepare(
      `SELECT f.id, f.kind, f.message, f.page, f.status, f.created_at, u.name AS user_name, u.handle AS user_handle, u.email AS user_email
       FROM feedback f LEFT JOIN "user" u ON u.id = f.user_id WHERE f.status = ? ORDER BY f.created_at DESC LIMIT ?`,
    )
    .bind(status, limit)
    .all<FeedbackRow>();
  return results;
}

export async function newFeedbackCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE status = 'new'`).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Marks feedback handled or reopens it; false when it doesn't exist or is already in that state. */
export async function setFeedbackStatus(db: D1Database, id: string, status: "new" | "done", actorId: string): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE feedback SET status = ?1, handled_at = ?2, handled_by = ?3 WHERE id = ?4 AND status != ?1`)
    .bind(status, status === "done" ? nowIso() : null, status === "done" ? actorId : null, id)
    .run();
  return res.meta.changes > 0;
}
