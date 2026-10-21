import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { sitemapEntries } from "../../lib/db";
import { SITEMAPS, urlsetXml, xmlResponse, type SitemapName, type SitemapUrl } from "../../lib/sitemap";
import { toolImageSrc } from "../../lib/tool-image";
import { CATEGORIES } from "../../lib/validation";

export const GET: APIRoute = async ({ params }) => {
  const name = params.name as SitemapName;
  if (!SITEMAPS.includes(name)) return new Response("Not found", { status: 404 });
  const { tools, collections, tags } = await sitemapEntries(env.DB);
  const urls: Record<SitemapName, () => SitemapUrl[]> = {
    pages: () => [
      { loc: "/" },
      { loc: "/explore" },
      ...CATEGORIES.map((c) => ({ loc: `/explore/${c.id}` })),
      { loc: "/collections" },
      ...collections.map((c) => ({ loc: `/collections/${c.slug}`, lastmod: c.updated_at })),
      { loc: "/about" },
      { loc: "/contribute" },
    ],
    tools: () =>
      tools.map((t) => {
        const cover = toolImageSrc(t);
        return { loc: `/tools/${t.slug}`, lastmod: t.updated_at, images: cover ? [{ loc: cover, title: t.name }] : [] };
      }),
    tags: () => tags.map((t) => ({ loc: `/tags/${t}` })),
  };
  return xmlResponse(urlsetXml(urls[name]()));
};
