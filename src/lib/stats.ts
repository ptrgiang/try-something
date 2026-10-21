import { env } from "cloudflare:workers";
import { acquisitionOf, cleanSurface, countryOf, isAutomation, isBot, isMobile, normalizePath, searchTerm, sourceOf } from "./analytics";
import {
  bumpSurfaceFunnel,
  markUserActive,
  markVisitStep,
  pruneNotifications,
  pruneSearchStats,
  pruneUserActivity,
  pruneVisits,
  recordImpressions,
  recordPageView,
  recordSearch,
  recordStat,
  recordSurfaceStat,
  recordTryer,
  startVisit,
  type FunnelStepKey,
} from "./db";
import { isModerator } from "./moderation";
import { NOTIFICATION_DAYS } from "./notifications";
import { rateLimit } from "./rate-limit";
import { clientKey, isSameOrigin } from "./util";

const today = () => new Date().toISOString().slice(0, 10);

/** Salted hash of the IP that changes every UTC day; the raw IP is never stored. */
async function visitorKey(request: Request, day: string): Promise<string> {
  const ip = clientKey(request.headers.get("cf-connecting-ip"));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}|${day}|${ip}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest).slice(0, 12)));
}

/**
 * Traffic that never counts: crawlers, scripted browsers (screenshots, audits; the e2e server opts back in with
 * ANALYTICS_COUNT_AUTOMATION) and signed-in staff, whose own browsing would swamp an early audience.
 */
function ignored(request: Request, user: { role: string } | null): boolean {
  const ua = request.headers.get("user-agent");
  if (isBot(ua)) return true;
  if (isAutomation(ua) && env.ANALYTICS_COUNT_AUTOMATION !== "true") return true;
  return isModerator(user?.role);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Occasionally prune expired rate-limit windows and funnel state so per-visitor keys don't accumulate.
async function maybePrune() {
  if (Math.random() >= 0.02) return;
  await env.DB.prepare(`DELETE FROM app_rate_limit WHERE window_start < ?`).bind(Math.floor(Date.now() / 1000) - 2 * 86400).run();
  await pruneVisits(env.DB);
}

/** Funnel steps for a visitor who loaded a counted page today; a try also counts as engaging. */
async function funnel(visitor: string, step: FunnelStepKey, surfaces: (string | null)[]) {
  const steps: FunnelStepKey[] = step === "tried" ? ["engaged", "tried"] : ["engaged"];
  let inFunnel = false;
  for (const s of steps) if ((await markVisitStep(env.DB, visitor, s)) !== "none") inFunnel = true;
  if (!inFunnel) return;
  for (const surface of new Set(surfaces.filter((s): s is string => Boolean(s)))) {
    for (const s of steps) {
      if (await rateLimit(env.DB, `f${s[0]}:${visitor}:${surface}`, 1, 86400)) await bumpSurfaceFunnel(env.DB, today(), surface, s);
    }
  }
}

// Handles a beacon for a "Try it" click or a tool page view. Each visitor counts at most once per tool per day.
export async function countOnce(request: Request, kind: "tries" | "views", user: { role: string } | null): Promise<Response> {
  const noContent = new Response(null, { status: 204 });
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const body = await readJson(request);
  const toolId = typeof body?.toolId === "string" ? body.toolId.slice(0, 64) : "";
  if (!toolId) return new Response(null, { status: 400 });
  if (ignored(request, user)) return noContent;

  const visitor = await visitorKey(request, today());
  const daily = kind === "views" ? 300 : 60;
  if (!(await rateLimit(env.DB, `${kind}:${visitor}`, daily, 86400))) return noContent;
  if (!(await rateLimit(env.DB, `${kind}:${visitor}:${toolId}`, 1, 86400))) return noContent;
  if (!(await recordStat(env.DB, toolId, kind))) return noContent;
  const surface = cleanSurface(body?.surface);
  if (surface) await recordSurfaceStat(env.DB, toolId, surface, kind);
  if (kind === "tries" && (await rateLimit(env.DB, `tryer:${visitor}`, 1, 86400))) await recordTryer(env.DB);
  await funnel(visitor, kind === "tries" ? "tried" : "engaged", [surface]);
  await maybePrune();
  return noContent;
}

// Handles a batch of cards seen on screen. The browser already sends each tool once per surface per visit;
// the daily cap only stops a runaway page from writing without limit.
export async function countImpressions(request: Request, user: { role: string } | null): Promise<Response> {
  const noContent = new Response(null, { status: 204 });
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const body = await readJson(request);
  const raw = Array.isArray(body?.items) ? body.items.slice(0, 60) : [];
  const seen = new Set<string>();
  const items: { surface: string; toolId: string }[] = [];
  for (const item of raw) {
    const surface = cleanSurface(item?.s);
    const toolId = typeof item?.t === "string" ? item.t.slice(0, 64) : "";
    if (!surface || !toolId || seen.has(`${surface}|${toolId}`)) continue;
    seen.add(`${surface}|${toolId}`);
    items.push({ surface, toolId });
  }
  if (!items.length) return new Response(null, { status: 400 });
  if (ignored(request, user)) return noContent;
  const visitor = await visitorKey(request, today());
  if (!(await rateLimit(env.DB, `imp:${visitor}`, 200, 86400))) return noContent;
  await recordImpressions(env.DB, items);
  await funnel(visitor, "engaged", items.map((i) => i.surface));
  return noContent;
}

// Accounts already marked active today in this isolate, to skip a D1 write on every page.
const activeSeen = new Set<string>();

// Handles the page-view beacon for site analytics: daily totals per page, source and country only.
export async function countPageView(request: Request, user: { id: string; role: string } | null): Promise<Response> {
  const noContent = new Response(null, { status: 204 });
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const body = await readJson(request);
  const path = normalizePath(body?.path);
  if (!path) return new Response(null, { status: 400 });
  const ua = request.headers.get("user-agent");
  if (isBot(ua)) return noContent;

  const day = today();
  // Retention covers every account, staff included in the data but left out of the cohorts.
  if (user && !activeSeen.has(`${user.id}|${day}`)) {
    await markUserActive(env.DB, user.id, day);
    activeSeen.add(`${user.id}|${day}`);
    if (activeSeen.size > 5000) activeSeen.clear();
  }
  if (ignored(request, user)) return noContent;

  const visitor = await visitorKey(request, day);
  if (!(await rateLimit(env.DB, `pv:${visitor}`, 500, 86400))) return noContent;
  const firstOfDay = await rateLimit(env.DB, `pv-first:${visitor}`, 1, 86400);
  const cf = (request as Request & { cf?: { country?: unknown } }).cf;
  const host = new URL(request.url).hostname;
  await recordPageView(env.DB, {
    day,
    path,
    firstOfDay,
    mobile: isMobile(ua),
    source: sourceOf(body?.referrer, body?.tag, host),
    country: countryOf(cf?.country),
  });
  await startVisit(env.DB, visitor, day, acquisitionOf(body, host));
  const term = path === "/explore" || path.startsWith("/explore/") ? searchTerm(body?.q) : null;
  if (term && (await rateLimit(env.DB, `q:${visitor}:${term}`, 1, 86400))) await recordSearch(env.DB, day, term);
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    await pruneUserActivity(env.DB, cutoff);
    await pruneSearchStats(env.DB, cutoff);
    await pruneNotifications(env.DB, new Date(Date.now() - NOTIFICATION_DAYS * 86400000).toISOString());
  }
  await maybePrune();
  return noContent;
}
