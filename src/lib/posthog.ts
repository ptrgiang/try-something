// PostHog, in the Ship Standard's privacy mode, feeds visitor numbers to Ship Something. What it may
// receive is promised on /privacy: change that page in the same commit as anything sent from here.
import pkg from "../../package.json";
import { isAutomation, isBot } from "./analytics";
import { isModerator } from "./moderation";
import { clientKey } from "./util";

export const PRODUCT_ID = "try-something";
export const PRODUCT_VERSION: string = pkg.version;

export type PosthogEnv = Pick<Cloudflare.Env, "POSTHOG_PROJECT_KEY" | "POSTHOG_HOST" | "BETTER_AUTH_SECRET" | "ANALYTICS_COUNT_AUTOMATION">;

/** Ingestion host (`https://us.i.posthog.com`); the private app host drops the `.i`. */
export const ingestHost = (env: Pick<PosthogEnv, "POSTHOG_HOST">) => (env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
export const uiHost = (env: Pick<PosthogEnv, "POSTHOG_HOST">) => ingestHost(env).replace(".i.posthog.com", ".posthog.com");

/** Same rules as the first-party counts (stats.ts), plus GPC / DNT sent as request headers. */
export function posthogAllowed(env: PosthogEnv, headers: Headers, user: { role: string } | null): boolean {
  if (!env.POSTHOG_PROJECT_KEY) return false;
  const ua = headers.get("user-agent");
  if (isBot(ua)) return false;
  if (isAutomation(ua) && env.ANALYTICS_COUNT_AUTOMATION !== "true") return false;
  if (headers.get("sec-gpc") === "1" || headers.get("dnt") === "1") return false;
  return !isModerator(user?.role);
}

/**
 * The PostHog distinct id: a salted hash of the IP that changes every UTC day. Nothing is stored in the
 * browser, so without it every page load would count as a new visitor. Salted apart from the D1 visitor
 * key so the two can't be joined.
 */
export async function visitorId(secret: string, ip: string | null, day = new Date().toISOString().slice(0, 10)): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}|posthog|${day}|${clientKey(ip)}`));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest).slice(0, 16)));
  return `v_${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** Where `/ingest/*` goes. Set as a pathname, never resolved against the host, so `//evil.example` stays a path. */
export function upstreamUrl(requestUrl: URL, host: string, prefix = "/ingest"): URL {
  const path = requestUrl.pathname.slice(prefix.length) || "/";
  const assets = path.startsWith("/static/") || path.startsWith("/array/");
  const upstream = new URL(assets ? host.replace(".i.posthog.com", "-assets.i.posthog.com") : host);
  upstream.pathname = path;
  upstream.search = requestUrl.search;
  return upstream;
}

// Anything that carries the visitor's IP or our session is dropped: PostHog never learns the IP.
const DROP_REQUEST_HEADERS = /^(cookie|authorization|cf-.*|x-forwarded-.*|x-real-ip|true-client-ip|forwarded)$/i;

export function upstreamHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const [name, value] of incoming) if (!DROP_REQUEST_HEADERS.test(name) && name !== "host") headers.set(name, value);
  return headers;
}

/** Same-origin reverse proxy, so the CSP stays `'self'`. Off (404) until a project key is set. */
export async function proxyPostHog(request: Request, env: PosthogEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.POSTHOG_PROJECT_KEY) return new Response("Not found", { status: 404 });
  if (!["GET", "HEAD", "POST", "OPTIONS"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
  const upstream = await fetchImpl(upstreamUrl(new URL(request.url), ingestHost(env)), {
    method: request.method,
    headers: upstreamHeaders(request.headers),
    body: request.method === "POST" ? await request.arrayBuffer() : undefined,
  });
  const response = new Response(upstream.body, upstream);
  response.headers.delete("set-cookie");
  return response;
}

/**
 * A server-side event, sent to the same daily visitor id the browser uses that day. Never rejects: callers
 * hand it to waitUntil and analytics must not break a sign-up or a submission.
 */
export async function captureServer(
  env: PosthogEnv,
  headers: Headers,
  user: { role: string } | null,
  event: string,
  properties: Record<string, string | number | boolean> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!posthogAllowed(env, headers, user)) return;
  try {
    const distinctId = await visitorId(env.BETTER_AUTH_SECRET, headers.get("cf-connecting-ip"));
    const res = await fetchImpl(`${ingestHost(env)}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: env.POSTHOG_PROJECT_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, product_id: PRODUCT_ID, product_version: PRODUCT_VERSION, $process_person_profile: false, $geoip_disable: true },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`posthog ${event}: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`posthog ${event} failed`, err);
  }
}
