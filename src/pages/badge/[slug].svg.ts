import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { badgeSvg, pickBadge } from "../../lib/badges";
import { getMakerClaim } from "../../lib/db";

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.slug ?? "";
  const tool = slug && slug.length <= 80 ? await getMakerClaim(env.DB, slug) : null;
  const { style, theme } = pickBadge(tool, url.searchParams.get("style"), url.searchParams.get("theme"));
  return new Response(badgeSvg(style, theme), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Embedded on other sites: let it be cached, but pick up a new verification within the hour.
      "cache-control": "public, max-age=3600",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
};
