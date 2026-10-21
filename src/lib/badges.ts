// "Listed on Try Something" badges that makers embed on their own sites and READMEs.

import { BADGE_ART } from "./badge-art";
import { SITE } from "./seo";

export const BADGE_STYLES = ["pill", "verified"] as const;
export const BADGE_THEMES = ["light", "dark"] as const;
export type BadgeStyle = (typeof BADGE_STYLES)[number];
export type BadgeTheme = (typeof BADGE_THEMES)[number];

export const BADGE_SIZE: Record<BadgeStyle, { width: number; height: number }> = {
  pill: { width: 182, height: 44 },
  verified: { width: 252, height: 52 },
};

/**
 * Which art to serve. The verified badge is only drawn for a published tool whose maker passed
 * verification; anything else (unknown, unpublished, unverified) quietly gets the plain pill, so the
 * image never reveals a tool's moderation state.
 */
export function pickBadge(tool: { status: string; maker_verified_at: string | null } | null, style: string | null, theme: string | null) {
  const verified = style === "verified" && tool?.status === "published" && Boolean(tool.maker_verified_at);
  return { style: (verified ? "verified" : "pill") as BadgeStyle, theme: (theme === "dark" ? "dark" : "light") as BadgeTheme };
}

export const badgeSvg = (style: BadgeStyle, theme: BadgeTheme) => BADGE_ART[style][theme];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const escapeMarkdown = (s: string) => s.replace(/[\\[\]]/g, "\\$&");

/** Copy-paste snippets. Links always point at the official site and carry UTM tags so /admin/stats can count badge clicks. */
export function badgeEmbed(tool: { slug: string; name: string }, style: BadgeStyle, theme: BadgeTheme) {
  const slug = encodeURIComponent(tool.slug);
  const src = `${SITE}/badge/${slug}.svg?style=${style}&theme=${theme}`;
  const href = `${SITE}/tools/${slug}?utm_source=badge&utm_medium=referral&utm_campaign=maker-badge`;
  const alt = `${tool.name} on Try Something`;
  const { width, height } = BADGE_SIZE[style];
  return {
    src,
    href,
    html: `<a href="${escapeHtml(href)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" height="${height}"></a>`,
    markdown: `[![${escapeMarkdown(alt)}](${src})](${href})`,
  };
}
