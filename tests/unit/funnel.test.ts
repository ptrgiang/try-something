import { describe, expect, it } from "vitest";
import { acquisitionOf, cleanSurface, funnelSteps, isAutomation, isBot, MIN_SAMPLE, rateOf, withUnattributed } from "../../src/lib/analytics";

describe("traffic filters", () => {
  it("flags scripted browsers that run JavaScript", () => {
    expect(isAutomation("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36")).toBe(true);
    expect(isAutomation("Mozilla/5.0 ... Chrome-Lighthouse")).toBe(true);
    expect(isAutomation("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")).toBe(false);
    expect(isAutomation(null)).toBe(false);
  });

  it("still treats a missing user agent as a bot", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot("Googlebot/2.1")).toBe(true);
  });

  it("knows the Surprise me surface", () => {
    expect(cleanSurface("surprise")).toBe("surprise");
    expect(cleanSurface("unattributed")).toBeNull();
  });
});

describe("acquisitionOf", () => {
  const host = "trysometh.ing";

  it("uses UTM values as given and never guesses medium or campaign", () => {
    expect(acquisitionOf({ tag: "Newsletter", medium: "email", campaign: "week-43", referrer: "https://mail.example.com/" }, host)).toEqual({
      source: "newsletter",
      medium: "email",
      campaign: "week-43",
    });
    expect(acquisitionOf({ referrer: "https://news.ycombinator.com/item?id=1" }, host)).toEqual({ source: "news.ycombinator.com", medium: "", campaign: "" });
  });

  it("falls back to direct (unknown) without inventing a source", () => {
    expect(acquisitionOf({ referrer: "" }, host).source).toBe("direct");
    expect(acquisitionOf(null, host)).toEqual({ source: "direct", medium: "", campaign: "" });
    expect(acquisitionOf({ referrer: "https://trysometh.ing/explore" }, host).source).toBe("direct");
  });

  it("drops UTM values that could carry personal data or markup", () => {
    expect(acquisitionOf({ medium: "<script>", campaign: "me@example.com" }, host)).toMatchObject({ medium: "", campaign: "" });
  });
});

describe("rates and funnel", () => {
  it("withholds a rate below the minimum sample", () => {
    expect(rateOf(3, MIN_SAMPLE - 1)).toBeNull();
    expect(rateOf(3, MIN_SAMPLE)).toBeCloseTo(3 / MIN_SAMPLE);
    expect(rateOf(0, 0, 0)).toBeNull();
  });

  it("computes step conversion and drop-off", () => {
    const [visit, engaged, tried] = funnelSteps(
      [
        { label: "v", count: 200 },
        { label: "e", count: 120 },
        { label: "t", count: 30 },
      ],
      30,
    );
    expect(visit).toMatchObject({ count: 200, fromPrev: null, dropped: 0 });
    expect(engaged).toMatchObject({ count: 120, fromPrev: 0.6, fromStart: 0.6, dropped: 80 });
    expect(tried).toMatchObject({ count: 30, fromPrev: 0.25, fromStart: 0.15, dropped: 90 });
  });

  it("never reports more than 100% when a later step arrives without the earlier one", () => {
    const steps = funnelSteps(
      [
        { label: "v", count: 40 },
        { label: "e", count: 50 },
        { label: "t", count: 60 },
      ],
      1,
    );
    expect(steps.map((s) => s.count)).toEqual([40, 40, 40]);
    expect(steps[2].fromPrev).toBe(1);
  });

  it("handles an empty period", () => {
    const steps = funnelSteps([
      { label: "v", count: 0 },
      { label: "e", count: 0 },
    ]);
    expect(steps[1]).toMatchObject({ count: 0, fromPrev: null, dropped: 0 });
  });
});

describe("withUnattributed", () => {
  const rows = [
    { surface: "picks", impressions: 6, views: 1, tries: 2 },
    { surface: "home", impressions: 12, views: 0, tries: 1 },
  ];

  it("adds the gap between per-tool totals and per-place totals as its own row", () => {
    const out = withUnattributed(rows, { views: 4, tries: 12 });
    expect(out.at(-1)).toEqual({ surface: "unattributed", impressions: 0, views: 3, tries: 9 });
    expect(out.reduce((n, r) => n + r.tries, 0)).toBe(12);
  });

  it("adds nothing when every try is attributed, or when there is no data", () => {
    expect(withUnattributed(rows, { views: 1, tries: 3 })).toHaveLength(2);
    expect(withUnattributed([], { views: 0, tries: 0 })).toEqual([]);
  });
});
