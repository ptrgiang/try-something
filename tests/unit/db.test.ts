import { describe, expect, it } from "vitest";
import { PERIODS, parsePeriod } from "../../src/lib/db";

describe("parsePeriod", () => {
  it("accepts the listed timeframes and defaults to all time", () => {
    for (const p of PERIODS) expect(parsePeriod(p.id)).toBe(p.id);
    expect(parsePeriod(null)).toBe("all");
    expect(parsePeriod("week")).toBe("all");
    expect(parsePeriod("month; DROP TABLE tool")).toBe("all");
  });
});
