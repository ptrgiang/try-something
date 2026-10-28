import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { listTools } from "../lib/db";
import { rssXml } from "../lib/feed";

export const GET: APIRoute = async () => {
  const tools = await listTools(env.DB, { sort: "new", limit: 30 });
  return new Response(rssXml(tools), { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=900" } });
};
