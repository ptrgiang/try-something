import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = () => {
  // Only the production host is indexable; previews and workers.dev stay out of search.
  const production = env.PUBLIC_SITE_URL === "https://trysometh.ing";
  const body = production
    ? `User-agent: *\nDisallow: /admin\nDisallow: /me\nDisallow: /api\nDisallow: /login\nDisallow: /submit\nDisallow: /surprise\nSitemap: https://trysometh.ing/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
};
