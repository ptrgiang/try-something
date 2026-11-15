import { describe, expect, it } from "vitest";
import { distinctPicks } from "../../src/lib/util";

const t = (id: string) => ({ id });
const ids = (m: Map<string, { id: string }[]>, k: string) => (m.get(k) ?? []).map((x) => x.id);

describe("distinctPicks", () => {
  it("skips items an earlier group already shows", () => {
    const out = distinctPicks(["a", "b"], new Map([["a", [t("1"), t("2"), t("3")]], ["b", [t("1"), t("4"), t("5"), t("6")]]]), 3);
    expect(ids(out, "a")).toEqual(["1", "2", "3"]);
    expect(ids(out, "b")).toEqual(["4", "5", "6"]);
  });

  it("repeats only to fill a short group, keeping the group's own order", () => {
    const out = distinctPicks(["a", "b"], new Map([["a", [t("1"), t("2")]], ["b", [t("2"), t("1"), t("3")]]]), 3);
    expect(ids(out, "b")).toEqual(["2", "1", "3"]);
    const short = distinctPicks(["a", "b"], new Map([["a", [t("1"), t("2")]], ["b", [t("2"), t("3"), t("1"), t("4")]]]), 2);
    expect(ids(short, "b")).toEqual(["3", "4"]);
  });

  it("handles groups with no candidates", () => {
    expect(ids(distinctPicks(["x"], new Map(), 3), "x")).toEqual([]);
  });
});
