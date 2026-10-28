import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { listTools, popularTags } from "../../lib/db";
import { displayHost } from "../../lib/url";
import { json } from "../../lib/util";
import { plainText } from "../../lib/validation";

export const prerender = false;

// Results for the Ctrl+K palette: the same public search as /explore, trimmed to what a row shows.
// With no query it suggests what's trending this week; a query with no match gets popular tags to try instead.
export const GET: APIRoute = async ({ url }) => {
  const q = plainText(url.searchParams.get("q"), 80);
  const tools = await listTools(env.DB, q ? { q, limit: 8 } : { sort: "trending", limit: 6 });
  const results = tools.map((t) => ({ slug: t.slug, name: t.name, tagline: t.tagline, host: displayHost(t.url) }));
  const tags = q && !results.length ? await popularTags(env.DB, 6) : [];
  return json({ q, results, tags }, 200, { "cache-control": "public, max-age=60" });
};
