import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAvatarKey } from "../../lib/avatar";

export const prerender = false;

// Keys are never reused (a new upload gets a new key), so responses can be cached for good.
// The CSP and nosniff keep an uploaded file from ever being treated as a page.
export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? "";
  const obj = isAvatarKey(key) && env.AVATARS ? await env.AVATARS.get(key) : null;
  if (!obj) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      etag: obj.httpEtag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
};
