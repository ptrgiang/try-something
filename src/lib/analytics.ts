// Pure helpers for site analytics: which paths count, where a visit came from, and date ranges.
// Paths come from the browser, so only known public routes are accepted; anything else is dropped.

const PAGE_PATHS = [
  /^\/$/,
  /^\/(explore|collections|about|privacy|terms|contribute|submit|login|404)$/,
  /^\/(tools|collections|users|tags|explore)\/[a-z0-9][a-z0-9_-]{0,79}$/,
];

export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 120) return null;
  const path = raw.length > 1 ? raw.replace(/\/+$/, "").toLowerCase() : raw;
  return PAGE_PATHS.some((re) => re.test(path)) ? path : null;
}

/**
 * An /explore search term as it is stored for the Searches report, or null for anything that might
 * identify someone (emails, links, long numbers) or is too short or long to be a real query.
 */
export function searchTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const term = raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (term.length < 2 || term.length > 60) return null;
  if (/@|:\/\/|www\.|\.(com|net|org|io|dev|app)(?=$|[\s/])|\d{6,}/.test(term)) return null;
  return term;
}

const TAG = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/** A utm_source/ref tag wins over the referrer; same-site and missing referrers are "direct". */
export function sourceOf(referrer: unknown, tag: unknown, siteHost: string): string {
  if (typeof tag === "string") {
    const t = tag.trim().toLowerCase();
    if (TAG.test(t)) return t;
  }
  if (typeof referrer !== "string" || !referrer) return "direct";
  try {
    const u = new URL(referrer);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "direct";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === siteHost.replace(/^www\./, "")) return "direct";
    return host.slice(0, 80);
  } catch {
    return "direct";
  }
}

// Discovery surfaces a beacon may name; anything else is dropped rather than stored.
const SURFACE = /^(hero|picks|home|top|explore|search|category|tag|collection(:[a-z0-9-]{1,80})?|related|profile|saved|palette|surprise|direct)$/;

export function cleanSurface(raw: unknown): string | null {
  return typeof raw === "string" && SURFACE.test(raw) ? raw : null;
}

export function isBot(ua: string | null): boolean {
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|monitor/i.test(ua);
}

/** Scripted browsers (screenshots, audits, test runs). They run JavaScript, so the bot check alone misses them. */
export function isAutomation(ua: string | null): boolean {
  return Boolean(ua && /headless|lighthouse|playwright|puppeteer|phantomjs|selenium|webdriver|chrome-lighthouse|pagespeed|gtmetrix/i.test(ua));
}

export interface Acquisition {
  source: string;
  /** utm_medium / utm_campaign as given, '' when absent: never guessed from the referrer. */
  medium: string;
  campaign: string;
}

const utm = (raw: unknown) => {
  if (typeof raw !== "string") return "";
  const t = raw.trim().toLowerCase();
  return TAG.test(t) ? t : "";
};

/** Where a visit came from: utm_source (or ref) wins, then the referring host, else "direct" (which includes unknown). */
export function acquisitionOf(body: { referrer?: unknown; tag?: unknown; medium?: unknown; campaign?: unknown } | null, siteHost: string): Acquisition {
  return { source: sourceOf(body?.referrer, body?.tag, siteHost), medium: utm(body?.medium), campaign: utm(body?.campaign) };
}

/** Below this many in the denominator a rate is shown as "too few" rather than a percentage. */
export const MIN_SAMPLE = 30;

export function rateOf(num: number, den: number, min = MIN_SAMPLE): number | null {
  return den >= min && den > 0 ? num / den : null;
}

export interface FunnelStep {
  label: string;
  count: number;
  /** Share of the previous step that reached this one (null for the first step or too small a sample). */
  fromPrev: number | null;
  /** Share of the first step. */
  fromStart: number | null;
  /** How many of the previous step stopped here. */
  dropped: number;
}

/** Steps must be nested (each a subset of the one before); counts are clamped so a late beacon can't exceed 100%. */
export function funnelSteps(steps: { label: string; count: number }[], min = MIN_SAMPLE): FunnelStep[] {
  const out: FunnelStep[] = [];
  for (const [i, s] of steps.entries()) {
    const prev = i ? out[i - 1].count : s.count;
    const count = Math.min(s.count, prev);
    out.push({
      label: s.label,
      count,
      fromPrev: i ? rateOf(count, prev, min) : null,
      fromStart: i ? rateOf(count, out[0].count, min) : null,
      dropped: i ? prev - count : 0,
    });
  }
  return out;
}

/**
 * Adds an explicit "unattributed" row for views and tries counted per tool but not credited to a surface
 * (beacons sent before surfaces were tracked, or from a button outside any surface).
 */
export function withUnattributed<T extends { surface: string; impressions: number; views: number; tries: number }>(
  rows: T[],
  totals: { views: number; tries: number },
): (T | { surface: "unattributed"; impressions: number; views: number; tries: number })[] {
  const views = totals.views - rows.reduce((n, r) => n + r.views, 0);
  const tries = totals.tries - rows.reduce((n, r) => n + r.tries, 0);
  return views > 0 || tries > 0 ? [...rows, { surface: "unattributed", impressions: 0, views: Math.max(0, views), tries: Math.max(0, tries) }] : rows;
}

export function isMobile(ua: string | null): boolean {
  return Boolean(ua && /Mobi|Android|iPhone|iPod/i.test(ua));
}

export function countryOf(raw: unknown): string {
  return typeof raw === "string" && /^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1" ? raw : "unknown";
}

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export interface DateRange {
  from: string; // first day, inclusive (YYYY-MM-DD, UTC)
  to: string; // last day, inclusive
  prevFrom: string;
  prevTo: string;
  days: string[];
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function dateRange(days: RangeDays, now = Date.now()): DateRange {
  const D = 86400000;
  const today = Date.parse(dayOf(now));
  const list = Array.from({ length: days }, (_, i) => dayOf(today - (days - 1 - i) * D));
  return { from: list[0], to: list[days - 1], prevFrom: dayOf(today - (2 * days - 1) * D), prevTo: dayOf(today - days * D), days: list };
}

/** "+12%", "−8%", "new" or "" when there is nothing to compare. */
export function change(now: number, before: number): string {
  if (!before) return now ? "new" : "";
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return "no change";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}
