import { describe, expect, it } from "vitest";
import { discoverUrl, parseMood, parseSeen, parseSkip, parseStep, SESSION_LENGTH, SKIP_MAX } from "../../src/lib/discover";

describe("discovery session params", () => {
  it("reads known moods only", () => {
    expect(parseMood("play")?.categories).toEqual(["play", "fun"]);
    expect(parseMood("anything")?.categories).toBeNull();
    expect(parseMood("nope")).toBeNull();
  });

  it("keeps valid, unique slugs and caps the list", () => {
    expect(parseSeen("a,b,a,Bad Slug,,c")).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: 60 }, (_, i) => `t${i}`).join(",");
    expect(parseSeen(many)).toHaveLength(40);
    expect(parseSeen(many).at(-1)).toBe("t59");
  });

  it("clamps the step to the round", () => {
    expect(parseStep("2")).toBe(2);
    expect(parseStep("0")).toBe(1);
    expect(parseStep(String(SESSION_LENGTH + 1))).toBe(1);
    expect(parseStep(null)).toBe(1);
  });

  it("builds the next URL", () => {
    expect(discoverUrl("make", 2, ["kleki"])).toBe("/discover?mood=make&step=2&seen=kleki");
    expect(discoverUrl("make", 1, [])).toBe("/discover?mood=make&step=1");
  });

  it("carries tried tools through the round, newest kept", () => {
    expect(discoverUrl("play", 2, ["a"], ["x", "y"])).toBe("/discover?mood=play&step=2&seen=a&skip=x%2Cy");
    const many = Array.from({ length: 50 }, (_, i) => `t${i}`).join(",");
    expect(parseSkip(many)).toHaveLength(SKIP_MAX);
    expect(parseSkip(many).at(-1)).toBe("t49");
    expect(parseSkip("ok,Not OK")).toEqual(["ok"]);
  });
});
