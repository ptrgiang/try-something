import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fetchMetadata } from "../../lib/metadata";
import { findDuplicate } from "../../lib/db";
import { rateLimit } from "../../lib/rate-limit";
import { canonicalKey, parseUserUrl, UnsafeUrlError } from "../../lib/url";
import { isSameOrigin, json } from "../../lib/util";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return json({ error: "Bad origin." }, 403);
  if (!locals.user) return json({ error: "Sign in first." }, 401);
  if (!(await rateLimit(env.DB, `meta:${locals.user.id}`, 20, 600))) return json({ error: "Too many lookups. Wait a few minutes." }, 429);
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  let url: URL;
  try {
    url = parseUserUrl(String(body.url ?? ""));
  } catch (e) {
    return json({ error: e instanceof UnsafeUrlError ? e.message : "Invalid URL." }, 400);
  }
  const duplicate = await findDuplicate(env.DB, canonicalKey(url));
  try {
    const meta = await fetchMetadata(url);
    return json({ ...meta, duplicate });
  } catch (e) {
    const message = e instanceof UnsafeUrlError ? e.message : "The site didn't respond in time.";
    return json({ error: message, duplicate }, 422);
  }
};
