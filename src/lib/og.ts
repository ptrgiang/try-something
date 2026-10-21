// Social share cards (Open Graph images): what each card shows and its layout as a satori node tree.
// Rendering to PNG lives in og-render.ts so this file stays testable without wasm.

import { artFor, type ToolArt } from "./db";
import { CATEGORIES } from "./validation";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
// Bump when the layout changes so every card is drawn again.
const LAYOUT = "1";

export type OgKind = "tool" | "tag" | "category" | "collection";
export const OG_KINDS: readonly OgKind[] = ["tool", "tag", "category", "collection"];

export interface OgTool {
  id: string;
  name: string;
  art?: ToolArt;
  hasCover: boolean;
}

export interface OgCard {
  kind: OgKind;
  /** Slug, tag or category id: the last segment of the card's URL. */
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  tools: OgTool[];
}

const ogTool = (t: { id: string; name: string; art?: ToolArt; image_key?: string | null; image_url: string | null }): OgTool => ({
  id: t.id,
  name: t.name,
  art: t.art,
  hasCover: Boolean(t.image_key || t.image_url),
});

type CardTool = Parameters<typeof ogTool>[0];

export function toolCard(tool: CardTool & { slug: string; tagline: string }, category?: string): OgCard {
  return { kind: "tool", id: tool.slug, eyebrow: category ?? "Web tool", title: tool.name, subtitle: tool.tagline, tools: [ogTool(tool)] };
}

export function listCard(kind: Exclude<OgKind, "tool">, id: string, title: string, subtitle: string, count: number, tools: CardTool[]): OgCard {
  const label = { tag: "Tag", category: "Category", collection: "Collection" }[kind];
  return { kind, id, eyebrow: `${label} · ${count} ${count === 1 ? "tool" : "tools"}`, title, subtitle, tools: tools.slice(0, 4).map(ogTool) };
}

export const tagCard = (tag: string, count: number, tools: CardTool[]) =>
  listCard("tag", tag, `#${tag}`, `Hand-picked tools tagged #${tag} that you can try in your browser.`, count, tools);

export function categoryCard(id: string, count: number, tools: CardTool[]): OgCard | null {
  const c = CATEGORIES.find((c) => c.id === id);
  return c ? listCard("category", id, `${c.label} tools`, c.blurb, count, tools) : null;
}

export const collectionCard = (c: { slug: string; title: string; description: string | null; tools: CardTool[] }) =>
  listCard("collection", c.slug, c.title, c.description ?? "Tools picked by the editors to try together.", c.tools.length, c.tools);

/** Short hash of everything drawn on the card, so a changed card gets a new URL and is drawn again. */
export function ogVersion(card: OgCard): string {
  let h = 0x811c9dc5;
  for (const ch of LAYOUT + JSON.stringify(card)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}

export const ogPath = (card: OgCard) => `/og/${card.kind}/${encodeURIComponent(card.id)}.png?v=${ogVersion(card)}`;
export const ogAlt = (card: OgCard) => `${card.title}: ${card.subtitle}`;

export const clip = (s: string, max: number) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

// ---------- Layout ----------

type Style = Record<string, string | number>;
export interface OgNode {
  type: string;
  props: { style?: Style; src?: string; width?: number; height?: number; children?: (OgNode | string)[] | string };
}

const INK = "#17141f";
const CORAL = "#ff6a45";
const el = (type: string, style: Style, children?: OgNode["props"]["children"], extra: Partial<OgNode["props"]> = {}): OgNode => ({
  type,
  props: { style, ...extra, ...(children === undefined ? {} : { children }) },
});

const LOGO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M12 10.5v17.2l4.6-4.3 3.3 6.6 3.2-1.6-3.3-6.5h6.2z" fill="${INK}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><g stroke="${CORAL}" stroke-width="2.6" stroke-linecap="round"><path d="M8.6 7.4 6 4.8M12 6V2.6M15.4 7.4 18 4.8"/></g></svg>`,
)}`;

const titleSize = (t: string) => (t.length <= 12 ? 96 : t.length <= 20 ? 80 : t.length <= 32 ? 64 : 54);

function tile(t: OgTool, cover: string | undefined, w: number, h: number, rotate: number): OgNode {
  const frame: Style = {
    display: "flex",
    width: w,
    height: h,
    borderRadius: 24,
    overflow: "hidden",
    transform: `rotate(${rotate}deg)`,
    boxShadow: "0 18px 40px rgba(23, 20, 31, 0.18)",
    border: "4px solid #ffffff",
  };
  if (cover) return el("div", frame, [el("img", { width: w, height: h, objectFit: "cover" }, undefined, { src: cover, width: w, height: h })]);
  // Same palette as the site's generated cover art for this tool.
  const fallback = artFor(t.name).palette!;
  const [c1, c2, c3, bg] = t.art?.palette?.length === 4 ? t.art.palette : fallback;
  const d = Math.round(h * 0.9);
  return el("div", { ...frame, position: "relative", background: bg, alignItems: "center", justifyContent: "center" }, [
    el("div", { position: "absolute", width: d, height: d, borderRadius: d, background: c1, left: -d * 0.3, top: -d * 0.35 }),
    el("div", { position: "absolute", width: d * 0.8, height: d * 0.8, borderRadius: d, background: c2, right: -d * 0.2, bottom: -d * 0.4 }),
    el("div", { position: "absolute", width: d * 0.3, height: d * 0.3, borderRadius: d, background: c3, right: w * 0.18, top: h * 0.12 }),
    el("div", { display: "flex", fontFamily: "Fraunces", fontSize: Math.round(h / 5), color: INK, padding: "0 24px", textAlign: "center" }, clip(t.name, 18)),
  ]);
}

function collage(card: OgCard, covers: Map<string, string>): OgNode {
  const tools = card.tools;
  if (!tools.length) return el("div", { display: "flex" });
  if (card.kind === "tool" || tools.length === 1) return tile(tools[0], covers.get(tools[0].id), 500, 330, -3);
  const spin = [-3, 2.5, 2, -2.5];
  return el(
    "div",
    { display: "flex", flexWrap: "wrap", width: 540, gap: 28, justifyContent: "center" },
    tools.map((t, i) => tile(t, covers.get(t.id), 250, 170, spin[i])),
  );
}

/** The card as a satori tree. `covers` maps tool ids to image data URIs; tools without one get generated art. */
export function ogTree(card: OgCard, covers: Map<string, string> = new Map()): OgNode {
  const title = clip(card.title, 48);
  return el("div", { display: "flex", position: "relative", width: OG_WIDTH, height: OG_HEIGHT, background: "#fffdf9", fontFamily: "Manrope", color: INK }, [
    el("div", { position: "absolute", width: 620, height: 620, borderRadius: 620, background: "#e4dcff", right: -170, top: -190 }),
    el("div", { position: "absolute", width: 380, height: 380, borderRadius: 380, background: "#ffd84a", right: 140, bottom: -250 }),
    el("div", { display: "flex", flexDirection: "column", justifyContent: "center", width: 620, height: OG_HEIGHT, padding: "0 0 0 80px" }, [
      el("div", { display: "flex", alignItems: "center", fontSize: 32, fontWeight: 700 }, [
        el("img", { width: 40, height: 40, marginRight: 10 }, undefined, { src: LOGO, width: 40, height: 40 }),
        el("span", {}, "trysometh"),
        el("span", { color: CORAL }, ".ing"),
      ]),
      el("div", { display: "flex", marginTop: 52, fontSize: 22, fontWeight: 700, letterSpacing: 3, color: "#6b6577", textTransform: "uppercase" }, clip(card.eyebrow, 40)),
      el("div", { display: "flex", marginTop: 14, fontFamily: "Fraunces", fontSize: titleSize(title), lineHeight: 1.02, letterSpacing: -2 }, title),
      el("div", { display: "flex", marginTop: 24, fontSize: 28, lineHeight: 1.35, color: "#3a3546" }, clip(card.subtitle, 110)),
    ]),
    el("div", { display: "flex", position: "absolute", left: 640, top: 0, width: 560, height: OG_HEIGHT, alignItems: "center", justifyContent: "center" }, [
      collage(card, covers),
    ]),
  ]);
}
