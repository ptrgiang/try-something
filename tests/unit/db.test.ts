import { describe, expect, it } from "vitest";
import { PERIODS, parsePeriod, pickSimilar } from "../../src/lib/db";

describe("pickSimilar", () => {
  const t = (id: string, category: string, tags: string[] = []) => ({ id, category, tags });
  const tool = { category: "play", tags: ["music", "crafting", "puzzle"] };

  it("drops single-tag matches from other categories once there are enough strong ones", () => {
    const ranked = [t("a", "play", ["music"]), t("b", "play"), t("c", "play"), t("d", "build", ["music"]), t("e", "play")];
    const { tools, sameKind } = pickSimilar(ranked, tool, 8);
    expect(tools.map((x) => x.id)).toEqual(["a", "b", "c", "e"]);
    expect(sameKind).toBe(true);
  });

  it("keeps another category's tool that shares two tags, and then names no category", () => {
    const ranked = [t("a", "fun", ["crafting", "puzzle"]), t("b", "play"), t("c", "play"), t("d", "play"), t("e", "build", ["music"])];
    const { tools, sameKind } = pickSimilar(ranked, tool, 8);
    expect(tools.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(sameKind).toBe(false);
  });

  it("fills a short list with weaker matches, up to the limit", () => {
    const ranked = [t("a", "build", ["music"]), t("b", "play"), t("c", "fun", ["puzzle"]), t("d", "play")];
    const { tools, sameKind } = pickSimilar(ranked, tool, 3);
    expect(tools.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(sameKind).toBe(false);
  });
});

describe("parsePeriod", () => {
  it("accepts the listed timeframes and defaults to all time", () => {
    for (const p of PERIODS) expect(parsePeriod(p.id)).toBe(p.id);
    expect(parsePeriod(null)).toBe("all");
    expect(parsePeriod("week")).toBe("all");
    expect(parsePeriod("month; DROP TABLE tool")).toBe("all");
  });
});
