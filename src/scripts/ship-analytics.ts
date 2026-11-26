// Client side of PostHog (see src/lib/posthog.ts). Pure helpers first so unit tests can import them.

/** Query parameters a page address keeps when it goes to PostHog; search terms and the rest are dropped. */
const KEPT_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"];

/**
 * Our own addresses keep the path and campaign tags only. Another site's address shrinks to its origin,
 * as the privacy page promises ("never the full address of the page you came from").
 */
export function scrubUrl(value: string, siteHost: string): string {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return value;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return value;
  if (u.hostname !== siteHost) return u.origin;
  const kept = new URLSearchParams();
  for (const k of KEPT_PARAMS) {
    const v = u.searchParams.get(k);
    if (v) kept.set(k, v.slice(0, 200));
  }
  const q = kept.toString();
  return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`;
}

// `title` can hold a search query; PostHog's own $pathname and $host already say which page it was.
const DROPPED = new Set(["title", "$title"]);

export function scrubProperties(props: Record<string, unknown> | undefined, siteHost: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (DROPPED.has(k)) continue;
    if (typeof v === "string" && /^https?:\/\//i.test(v)) out[k] = scrubUrl(v, siteHost);
    else if ((k === "$set" || k === "$set_once") && v && typeof v === "object") out[k] = scrubProperties(v as Record<string, unknown>, siteHost);
    else out[k] = v;
  }
  return out;
}

type ShipWindow = Window & { ship?: { capture(event: string, properties?: Record<string, unknown>): void }; SHIP_ANALYTICS?: unknown };

/** Sends an event when PostHog is on for this page; a no-op otherwise (no key, staff, GPC / DNT). */
export function track(event: string, properties?: Record<string, string | number>): void {
  (window as ShipWindow).ship?.capture(event, properties);
}

interface ServerConfig {
  productId: string;
  productVersion: string;
  posthogKey: string;
  uiHost: string;
  distinctId: string;
}

/** Reads the config Base.astro rendered and loads /ship-analytics.js (inline scripts are blocked by the CSP). */
export function startShipAnalytics(): void {
  const raw = document.querySelector<HTMLElement>("[data-ship-analytics]")?.dataset.shipAnalytics;
  if (!raw) return;
  const { distinctId, ...cfg } = JSON.parse(raw) as ServerConfig;
  const host = location.hostname;
  (window as ShipWindow).SHIP_ANALYTICS = {
    ...cfg,
    apiHost: "/ingest",
    mode: "privacy",
    consent: "none",
    spa: true,
    posthogOptions: {
      bootstrap: { distinctID: distinctId, isIdentifiedID: false },
      before_send: (e: { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> } | null) => {
        if (!e) return e;
        e.properties = { ...scrubProperties(e.properties, host), $geoip_disable: true };
        if (e.$set) e.$set = scrubProperties(e.$set, host);
        if (e.$set_once) e.$set_once = scrubProperties(e.$set_once, host);
        return e;
      },
      disable_surveys: true,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_performance: false,
      capture_exceptions: false,
    },
  };
  const s = document.createElement("script");
  s.src = "/ship-analytics.js";
  s.async = true;
  document.head.appendChild(s);
}
