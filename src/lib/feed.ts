// RSS 2.0 for /feed.xml: the newest listings, so readers and crawlers pick up new tools without polling pages.

import { SITE } from "./seo";

export interface FeedItem {
  slug: string;
  name: string;
  tagline: string;
  try_this: string;
  published_at: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function rssXml(items: FeedItem[]): string {
  const body = items
    .map((t) => {
      const link = esc(new URL(`/tools/${t.slug}`, SITE).toString());
      const description = esc(t.try_this ? `${t.tagline} Try this: ${t.try_this}` : t.tagline);
      return `    <item><title>${esc(t.name)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid><pubDate>${new Date(t.published_at).toUTCString()}</pubDate><description>${description}</description></item>`;
    })
    .join("\n");
  const updated = items[0] ? `\n    <lastBuildDate>${new Date(items[0].published_at).toUTCString()}</lastBuildDate>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Try Something: new tools</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>New web tools, experiments and tiny apps you can try in 30 seconds.</description>
    <language>en</language>${updated}
${body}
  </channel>
</rss>
`;
}
