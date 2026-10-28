import { describe, expect, it } from "vitest";
import { dailyShuffle, FRESH_DAYS, freshLabel, LABEL_DAYS, picksOrder, type PicksInput } from "../../src/lib/picks";
import { canResurface, RESURFACE_COOLDOWN_DAYS, updateCheck, UPDATE_LIMIT } from "../../src/lib/moderation";
import { parseToolUpdate } from "../../src/lib/validation";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();
const tool = (id: string, o: Partial<PicksInput> = {}): PicksInput => ({
  id,
  featured: 0,
  published_at: daysAgo(100),
  refreshed_at: null,
  impressions30: 0,
  ...o,
});
const ids = (list: PicksInput[]) => list.map((t) => t.id);

describe("picksOrder", () => {
  it("puts featured first in editor order, then fresh tools newest first, then the rest", () => {
    const list = [
      tool("old"),
      tool("new-a", { published_at: daysAgo(2) }),
      tool("feat-2", { featured: 2 }),
      tool("new-b", { published_at: daysAgo(1) }),
      tool("feat-1", { featured: 1 }),
    ];
    expect(ids(picksOrder(list, NOW))).toEqual(["feat-1", "feat-2", "new-b", "new-a", "old"]);
  });

  it("treats a resurfaced tool as fresh, and stops once the window passes", () => {
    const list = [tool("plain"), tool("refreshed", { refreshed_at: daysAgo(3) })];
    expect(ids(picksOrder(list, NOW))[0]).toBe("refreshed");
    const stale = [tool("refreshed", { refreshed_at: daysAgo(FRESH_DAYS + 1), impressions30: 1000 }), tool("plain")];
    expect(ids(picksOrder(stale, NOW))[0]).toBe("plain");
  });

  it("lifts tools seen far less than others", () => {
    const list = [tool("seen", { impressions30: 5000 }), tool("unseen", { impressions30: 0 })];
    expect(ids(picksOrder(list, NOW))).toEqual(["unseen", "seen"]);
  });

  it("is stable within a day and reshuffles similar tools across days", () => {
    const list = Array.from({ length: 12 }, (_, i) => tool(`t${i}`));
    expect(ids(picksOrder(list, NOW))).toEqual(ids(picksOrder([...list].reverse(), NOW + 3600000)));
    expect(ids(picksOrder(list, NOW))).not.toEqual(ids(picksOrder(list, NOW + 86400000)));
  });

  it("keeps search relevance above every other rule", () => {
    const list = [tool("feat", { featured: 1, relevance: 2 }), tool("name-match", { relevance: 0 })];
    expect(ids(picksOrder(list, NOW))).toEqual(["name-match", "feat"]);
  });

  it("dailyShuffle is in [0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      const v = dailyShuffle("2026-10-23", `id${i}`);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("product updates", () => {
  const mine = { status: "published", submitted_by: "u1", credit_type: "made" };

  it("only the maker who listed a published tool can post", () => {
    expect(updateCheck("u1", mine, 0, false)).toEqual({ ok: true });
    expect(updateCheck("u2", mine, 0, false)).toMatchObject({ ok: false, status: 403 });
    expect(updateCheck("u1", { ...mine, credit_type: "found" }, 0, false)).toMatchObject({ ok: false, status: 403 });
    expect(updateCheck("u1", { ...mine, status: "hidden" }, 0, false)).toMatchObject({ ok: false, status: 403 });
  });

  it("allows one waiting update and a few per window", () => {
    expect(updateCheck("u1", mine, 0, true)).toMatchObject({ ok: false, status: 409 });
    expect(updateCheck("u1", mine, UPDATE_LIMIT, false)).toMatchObject({ ok: false, status: 429 });
  });

  it("resurfaces at most once per cooldown", () => {
    expect(canResurface(null, NOW)).toBe(true);
    expect(canResurface(daysAgo(RESURFACE_COOLDOWN_DAYS - 1), NOW)).toBe(false);
    expect(canResurface(daysAgo(RESURFACE_COOLDOWN_DAYS), NOW)).toBe(true);
  });

  it("validates and cleans the update text", () => {
    const ok = parseToolUpdate({ note: "  Now exports to PNG.  ", tagline: "A drawing tool", tryThis: "Draw a cat and export it", why: "" });
    expect(ok).toMatchObject({ ok: true, value: { note: "Now exports to PNG." } });
    const bad = parseToolUpdate({ note: "new", tagline: "x", tryThis: "y" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["note", "tagline", "tryThis"]);
  });
});

describe("freshLabel", () => {
  it("labels tools published in the last week as New", () => {
    expect(freshLabel({ published_at: daysAgo(2), refreshed_at: null }, NOW)).toBe("New");
    expect(freshLabel({ published_at: daysAgo(LABEL_DAYS + 1), refreshed_at: null }, NOW)).toBeNull();
  });

  it("labels a recent resurface as Updated, and drops it after the week", () => {
    expect(freshLabel({ published_at: daysAgo(100), refreshed_at: daysAgo(1) }, NOW)).toBe("Updated");
    expect(freshLabel({ published_at: daysAgo(100), refreshed_at: daysAgo(LABEL_DAYS + 1) }, NOW)).toBeNull();
  });
});
