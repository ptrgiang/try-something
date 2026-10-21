import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { loadCoverOriginal, publicCover } from "../../../lib/covers";
import { isModerator } from "../../../lib/moderation";
import { rateLimit } from "../../../lib/rate-limit";
import { COVER_WIDTH } from "../../../lib/tool-image";

const HEADERS = {
  "content-security-policy": "default-src 'none'; sandbox",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
};

// Serves a tool's cover through our own origin: the submitter's upload from R2 first, otherwise the
// product's official share image (og:image), fetched so visitors' IPs aren't leaked to third parties
// and checked to be a raster image. Published covers are shrunk once, kept in R2 and cached at the edge;
// submission previews are the originals, visible only to moderators and the submitter (?src=upload|share).
export const GET: APIRoute = async ({ params, locals, request, url }) => {
  const id = params.id ?? "";
  let key: string | null = null;
  let source: string | null = null;
  let isPublic = false;
  if (params.kind === "tool") {
    const row = await env.DB.prepare(`SELECT image_key, image_url FROM tool WHERE id = ? AND status = 'published'`)
      .bind(id)
      .first<{ image_key: string | null; image_url: string | null }>();
    key = row?.image_key ?? null;
    source = row?.image_url ?? null;
    isPublic = true;
  } else if (params.kind === "submission") {
    const user = locals.user;
    const row = await env.DB.prepare(`SELECT image_key, image_url, user_id FROM submission WHERE id = ?`)
      .bind(id)
      .first<{ image_key: string | null; image_url: string | null; user_id: string }>();
    if (row && user && (isModerator(user.role) || row.user_id === user.id)) {
      const only = url.searchParams.get("src");
      key = only === "share" ? null : row.image_key;
      source = only === "upload" ? null : row.image_url;
    }
    // Uncached and submitter-chosen, so cap it: otherwise it is a free fetch proxy aimed at any site.
    if (!key && source && user && !(await rateLimit(env.DB, `media:${user.id}`, 60, 600))) return new Response("Too many requests", { status: 429 });
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://media.trysometh.ing/${params.kind}/${id}?w=${COVER_WIDTH}&r2=1&key=${encodeURIComponent(key ?? "")}&src=${encodeURIComponent(source ?? "")}`);
  if (isPublic) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  // Public covers come from the shrunk copy in R2; private previews show the original as submitted.
  const image = isPublic ? await publicCover(id, key, source) : await loadCoverOriginal(key, source);
  if (!image) return new Response(source ? "Image unavailable" : "Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });

  const { bytes, type } = image;
  const response = new Response(bytes, {
    headers: {
      ...HEADERS,
      "content-type": type,
      "cache-control": isPublic ? "public, max-age=86400, stale-while-revalidate=604800" : "private, max-age=300",
    },
  });
  if (isPublic && request.method === "GET") await cache.put(cacheKey, response.clone()).catch(() => {});
  return response;
};
