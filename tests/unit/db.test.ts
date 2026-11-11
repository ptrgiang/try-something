import { describe, expect, it } from "vitest";
import { PERIODS, parsePeriod, pickSimilar } from "../../src/lib/db";

describe("pickSimilar", () => {
  const t = (id: string, category: string) => ({ id, category });

  it("keeps to the tool's own category when it has enough tools", () => {
    const ranked = [t("a", "build"), t("b", "play"), t("c", "play"), t("d", "play"), t("e", "fun"), t("f", "play"), t("g", "play")];
    const { tools, sameKind } = pickSimilar(ranked, "play", 4);
    expect(sameKind).toBe(true);
    expect(tools.map((x) => x.id)).toEqual(["b", "c", "d", "f"]);
  });

  it("falls back to the closest matches of any category", () => {
    const ranked = [t("a", "build"), t("b", "play"), t("c", "fun"), t("d", "play")];
    const { tools, sameKind } = pickSimilar(ranked, "play", 3);
    expect(sameKind).toBe(false);
    expect(tools.map((x) => x.id)).toEqual(["a", "b", "c"]);
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
