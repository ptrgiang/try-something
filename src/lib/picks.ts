// The default "Picks" order for lists. Deterministic and explainable, tuned by editing the constants:
//   1. Featured tools, in the editors' order.
//   2. Fresh tools: published, or resurfaced by a moderator for a meaningful update, in the last FRESH_DAYS days.
//   3. Everyone else, tools seen less in the last 30 days first, with a shuffle that changes once a UTC day so the
//      same few don't sit on top. SHUFFLE is how much the shuffle can outweigh exposure (in doublings of cards seen).
// Search keeps its relevance tiers above all of this.

export const FRESH_DAYS = 14;
export const SHUFFLE = 2;

export interface PicksInput {
  id: string;
  featured: number;
  published_at: string;
  refreshed_at: string | null;
  /** Cards seen on screen in the last 30 days. */
  impressions30: number;
  /** Search relevance tier (0 = name match); 0 for every tool when there is no search. */
  relevance?: number;
}

/** A stable number in [0, 1) for a tool on a given day (FNV-1a). */
export function dailyShuffle(day: string, id: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${day}|${id}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

export function picksOrder<T extends PicksInput>(tools: T[], now = Date.now()): T[] {
  const day = new Date(now).toISOString().slice(0, 10);
  const freshSince = now - FRESH_DAYS * 86400000;
  const keyed = tools.map((t) => {
    const fresh = Math.max(Date.parse(t.published_at), t.refreshed_at ? Date.parse(t.refreshed_at) : 0);
    const tier = t.featured > 0 ? 0 : fresh >= freshSince ? 1 : 2;
    const within = tier === 0 ? t.featured : tier === 1 ? -fresh : Math.log2(1 + t.impressions30) + SHUFFLE * dailyShuffle(day, t.id);
    return { t, rel: t.relevance ?? 0, tier, within };
  });
  keyed.sort((a, b) => a.rel - b.rel || a.tier - b.tier || a.within - b.within || a.t.id.localeCompare(b.t.id));
  return keyed.map((k) => k.t);
}

/** Cards say why a tool sits high for a week; shorter than FRESH_DAYS so a big batch doesn't badge whole pages for long. */
export const LABEL_DAYS = 7;

export function freshLabel(t: Pick<PicksInput, "published_at" | "refreshed_at">, now = Date.now()): "New" | "Updated" | null {
  const since = now - LABEL_DAYS * 86400000;
  const published = Date.parse(t.published_at);
  const refreshed = t.refreshed_at ? Date.parse(t.refreshed_at) : 0;
  if (refreshed > published && refreshed >= since) return "Updated";
  return published >= since ? "New" : null;
}
