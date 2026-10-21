import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { sitemapEntries } from "../lib/db";
import { sitemapIndexXml, SITEMAPS, xmlResponse } from "../lib/sitemap";

export const GET: APIRoute = async () => {
  const { tools, collections } = await sitemapEntries(env.DB);
  const latest = [...tools, ...collections].map((r) => r.updated_at).sort().at(-1) ?? null;
  return xmlResponse(sitemapIndexXml(SITEMAPS.map((name) => ({ loc: `/sitemaps/${name}.xml`, lastmod: name === "tags" ? null : latest }))));
};
