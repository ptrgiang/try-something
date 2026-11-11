import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { robotsTxt, SITE } from "../lib/seo";

export const GET: APIRoute = () =>
  new Response(robotsTxt(env.PUBLIC_SITE_URL === SITE), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
