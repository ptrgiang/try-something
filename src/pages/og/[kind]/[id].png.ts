import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { publicCover } from "../../../lib/covers";
import { countTools, getCollection, getPublishedTool, listTools } from "../../../lib/db";
import { categoryCard, collectionCard, OG_KINDS, ogVersion, tagCard, toolCard, type OgCard, type OgKind } from "../../../lib/og";
import { coverDataUri, renderOgPng } from "../../../lib/og-render";
import { CATEGORIES, parseTags } from "../../../lib/validation";

// The same card each page builds for its og:image, rebuilt here from the database.
async function cardFor(kind: OgKind, id: string): Promise<{ card: OgCard; tools: { id: string; image_key?: string | null; image_url: string | null }[] } | null> {
  if (kind === "tool") {
    const tool = await getPublishedTool(env.DB, id);
    if (!tool) return null;
    return { card: toolCard(tool, CATEGORIES.find((c) => c.id === tool.category)?.label), tools: [tool] };
  }
  if (kind === "collection") {
    const c = await getCollection(env.DB, id);
    return c ? { card: collectionCard(c), tools: c.tools.slice(0, 4) } : null;
  }
  const filter = kind === "tag" ? { tag: parseTags(id)[0] === id ? id : undefined } : { category: CATEGORIES.some((c) => c.id === id) ? id : undefined };
  if (!filter.tag && !filter.category) return null;
  const [tools, count] = await Promise.all([listTools(env.DB, { ...filter, sort: "new", limit: 4 }), countTools(env.DB, filter)]);
  if (!count) return null;
  const card = kind === "tag" ? tagCard(id, count, tools) : categoryCard(id, count, tools);
  return card && { card, tools };
}

export const GET: APIRoute = async ({ params, request }) => {
  const kind = params.kind as OgKind;
  const id = params.id ?? "";
  if (!OG_KINDS.includes(kind) || !id || id.length > 80) return new Response("Not found", { status: 404 });

  const found = await cardFor(kind, id);
  if (!found) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });
  const v = ogVersion(found.card);
  const headers = { "content-type": "image/png", "cache-control": "public, max-age=604800", "x-content-type-options": "nosniff" };

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://og.trysometh.ing/${kind}/${encodeURIComponent(id)}?v=${v}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // One drawn copy per page in R2, replaced when what's on the card changes.
  const key = `og/${kind}/${id}.png`;
  const stored = await env.TOOL_IMAGES?.get(key);
  let png: Uint8Array<ArrayBuffer> | ArrayBuffer | null = stored?.customMetadata?.v === v ? await stored.arrayBuffer() : null;
  if (!png) {
    const covers = new Map<string, string>();
    await Promise.all(
      found.tools.map(async (t) => {
        if (!t.image_key && !t.image_url) return;
        const cover = await publicCover(t.id, t.image_key ?? null, t.image_url);
        const uri = cover && (await coverDataUri(env.IMAGES, cover));
        if (uri) covers.set(t.id, uri);
      }),
    );
    png = await renderOgPng(found.card, covers);
    await env.TOOL_IMAGES?.put(key, png, { httpMetadata: { contentType: "image/png" }, customMetadata: { v } });
  }
  const response = new Response(png, { headers });
  if (request.method === "GET") await cache.put(cacheKey, response.clone()).catch(() => {});
  return response;
};
