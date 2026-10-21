// Discovery analytics in the browser: which surface (hero, picks, explore, search, collection, ...) a card
// or Try button sits on, cards actually seen on screen, and the surface a tool page was reached from.
// sessionStorage only holds what this visit already sent; nothing identifies the visitor.

const ORIGIN_KEY = "ts:origin";
const SEEN_KEY = "ts:seen";

const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
/** Every analytics beacon checks this: no beacons for GPC / Do Not Track, or from staff pages. */
export const trackingAllowed =
  Boolean(navigator.sendBeacon) && !nav.globalPrivacyControl && navigator.doNotTrack !== "1" && !location.pathname.startsWith("/admin");

/** The surface an element belongs to, from the nearest [data-surface]. */
export function surfaceOf(el: Element | null): string | null {
  return el?.closest<HTMLElement>("[data-surface]")?.dataset.surface ?? null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(sessionStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Where the tool at `path` was opened from in this visit, or null for a direct visit. */
export function originFor(path: string): string | null {
  const o = readJson<{ path?: string; surface?: string; at?: number } | null>(ORIGIN_KEY, null);
  // Surprise me redirects to a tool the browser can't know in advance; a page shown right after counts.
  if (o?.path === "/surprise" && Date.now() - (o.at ?? 0) < 15000) {
    writeJson(ORIGIN_KEY, { path, surface: "surprise" });
    return "surprise";
  }
  return o?.path === path && o.surface ? o.surface : null;
}

const TOOL_PATH = /^\/tools\/[^/]+\/?$/;
let lastSurface: string | null = null;

// Remember the surface of a tool link as it's followed (full page or quick view). Quick view's Previous/Next
// sit outside any surface and keep the one the view was opened from.
document.addEventListener(
  "click",
  (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !TOOL_PATH.test(url.pathname)) return;
    const surface = surfaceOf(link) ?? (link.closest("[data-quick-view]") ? lastSurface : null);
    if (!surface) return;
    lastSurface = surface;
    writeJson(ORIGIN_KEY, { path: url.pathname, surface });
  },
  true,
);

// ---------- Surprise me ----------

const VIEWED_KEY = "ts:viewed";

/** Remembers a tool page shown in this visit, so Surprise me can skip it. */
export function noteToolSeen(path: string) {
  const slug = path.match(/^\/tools\/([^/]+)/)?.[1];
  if (!slug) return;
  const list = readJson<string[]>(VIEWED_KEY, []).filter((s) => s !== slug);
  writeJson(VIEWED_KEY, [...list, slug].slice(-40));
}

document.addEventListener(
  "click",
  (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>('a[href^="/surprise"]');
    if (!link) return;
    writeJson(ORIGIN_KEY, { path: "/surprise", surface: "surprise", at: Date.now() });
    const seen = readJson<string[]>(VIEWED_KEY, []);
    if (!seen.length) return;
    const url = new URL(link.href, location.href);
    url.searchParams.set("seen", seen.join(","));
    link.href = url.pathname + url.search;
  },
  true,
);

// ---------- Impressions ----------

const sent = new Set(readJson<string[]>(SEEN_KEY, []));
let queue: { s: string; t: string }[] = [];
let timer: number | undefined;

function flush() {
  window.clearTimeout(timer);
  if (!queue.length) return;
  navigator.sendBeacon("/api/impressions", new Blob([JSON.stringify({ items: queue.splice(0, 60) })], { type: "application/json" }));
  writeJson(SEEN_KEY, [...sent].slice(-800));
  if (queue.length) flush();
}

function seen(el: Element) {
  if (el.closest("[inert]")) return false;
  const surface = surfaceOf(el);
  const toolId = (el as HTMLElement).dataset.impression;
  if (!surface || !toolId) return false;
  const key = `${surface}|${toolId}`;
  if (!sent.has(key)) {
    sent.add(key);
    queue.push({ s: surface, t: toolId });
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 2000);
  }
  return true;
}

if (trackingAllowed && "IntersectionObserver" in window) {
  const observed = new WeakSet<Element>();
  // Half the card on screen counts as seen; inert slides wait until they become the active one.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting && seen(entry.target)) io.unobserve(entry.target);
    },
    { threshold: 0.5 },
  );
  const scan = () =>
    document.querySelectorAll("[data-surface] [data-impression]").forEach((el) => {
      if (observed.has(el)) return;
      observed.add(el);
      io.observe(el);
    });
  scan();
  document.addEventListener("ts:content", scan);
  // The hero slideshow announces each slide it shows; it only counts while the hero is on screen.
  document.addEventListener("ts:slide", (e) => {
    const slide = e.target as Element;
    const r = slide.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) seen(slide);
  });
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}
