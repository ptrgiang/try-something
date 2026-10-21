// XML for /sitemap.xml (an index) and the per-type sitemaps under /sitemaps/. Tool sitemaps list each
// cover as an image, so covers can show up in image search linked to the tool page.

import { SITE } from "./seo";

export interface SitemapUrl {
  loc: string; // site path
  lastmod?: string | null;
  images?: { loc: string; title?: string }[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (path: string) => esc(new URL(path, SITE).toString());
const day = (iso?: string | null) => (iso ? `<lastmod>${esc(iso.slice(0, 10))}</lastmod>` : "");

export function urlsetXml(urls: SitemapUrl[]): string {
  const hasImages = urls.some((u) => u.images?.length);
  const body = urls
    .map((u) => {
      const images = (u.images ?? [])
        .map((i) => `<image:image><image:loc>${abs(i.loc)}</image:loc>${i.title ? `<image:title>${esc(i.title)}</image:title>` : ""}</image:image>`)
        .join("");
      return `  <url><loc>${abs(u.loc)}</loc>${day(u.lastmod)}${images}</url>`;
    })
    .join("\n");
  const ns = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasImages ? ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : ""}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${body}\n</urlset>\n`;
}

export function sitemapIndexXml(maps: { loc: string; lastmod?: string | null }[]): string {
  const body = maps.map((m) => `  <sitemap><loc>${abs(m.loc)}</loc>${day(m.lastmod)}</sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export const SITEMAPS = ["pages", "tools", "tags"] as const;
export type SitemapName = (typeof SITEMAPS)[number];

export const xmlResponse = (xml: string) =>
  new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
