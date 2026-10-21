import { describe, expect, it } from "vitest";
import { change, cleanSurface, countryOf, dateRange, isBot, isMobile, normalizePath, searchTerm, sourceOf } from "../../src/lib/analytics";

describe("normalizePath", () => {
  it("accepts public routes and trims a trailing slash", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/explore/")).toBe("/explore");
    expect(normalizePath("/tools/Excalidraw")).toBe("/tools/excalidraw");
    expect(normalizePath("/users/ada_l")).toBe("/users/ada_l");
    expect(normalizePath("/404")).toBe("/404");
    expect(normalizePath("/explore/design")).toBe("/explore/design");
  });
  it("drops staff pages, unknown routes and junk", () => {
    for (const p of ["/admin/stats", "/me/settings", "/api/pv", "/tools/a/b", "/wp-login.php", "/tools/<x>", "", 42, null, `/${"a".repeat(130)}`]) {
      expect(normalizePath(p)).toBeNull();
    }
  });
});

describe("sourceOf", () => {
  const site = "trysometh.ing";
  it("uses a clean utm_source or ref tag first", () => {
    expect(sourceOf("https://news.ycombinator.com/item?id=1", "Newsletter", site)).toBe("newsletter");
    expect(sourceOf("", "x.com", site)).toBe("x.com");
  });
  it("falls back to the referring host without www", () => {
    expect(sourceOf("https://www.google.com/", null, site)).toBe("google.com");
    expect(sourceOf("https://news.ycombinator.com/item?id=1", "<script>", site)).toBe("news.ycombinator.com");
  });
  it("treats same-site, empty and odd referrers as direct", () => {
    expect(sourceOf("https://trysometh.ing/explore", null, site)).toBe("direct");
    expect(sourceOf("https://www.trysometh.ing/", null, site)).toBe("direct");
    expect(sourceOf("", null, site)).toBe("direct");
    expect(sourceOf("android-app://com.slack", null, site)).toBe("direct");
    expect(sourceOf("not a url", null, site)).toBe("direct");
  });
});

describe("user agent and country", () => {
  it("spots bots and phones", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (Windows NT 10.0) Chrome/130")).toBe(false);
    expect(isMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148")).toBe(true);
    expect(isMobile("Mozilla/5.0 (Macintosh) Safari/605")).toBe(false);
  });
  it("keeps two-letter country codes only", () => {
    expect(countryOf("VN")).toBe("VN");
    expect(countryOf("XX")).toBe("unknown");
    expect(countryOf("T1")).toBe("unknown");
    expect(countryOf("vn")).toBe("unknown");
    expect(countryOf(undefined)).toBe("unknown");
  });
});

describe("dateRange and change", () => {
  it("covers N days ending today, with the N days before for comparison", () => {
    const r = dateRange(7, Date.parse("2026-10-22T15:00:00Z"));
    expect(r).toMatchObject({ from: "2026-10-16", to: "2026-10-22", prevFrom: "2026-10-09", prevTo: "2026-10-15" });
    expect(r.days).toHaveLength(7);
    expect(r.days.at(-1)).toBe("2026-10-22");
  });
  it("labels the change from the previous period", () => {
    expect(change(120, 100)).toBe("+20%");
    expect(change(80, 100)).toBe("−20%");
    expect(change(100, 100)).toBe("no change");
    expect(change(5, 0)).toBe("new");
    expect(change(0, 0)).toBe("");
  });
});

describe("searchTerm", () => {
  it("lowercases, trims and collapses spaces", () => {
    expect(searchTerm("  Pixel   ART ")).toBe("pixel art");
    expect(searchTerm("json")).toBe("json");
  });
  it("drops terms that are too short, too long or not text", () => {
    for (const t of ["", " a ", "x".repeat(61), null, 42, ["json"]]) expect(searchTerm(t)).toBeNull();
  });
  it("drops anything that could identify a person", () => {
    for (const t of ["ada@example.com", "https://example.com/x", "www.mysite", "mysite.com", "call 0912345678", "order 123456"]) {
      expect(searchTerm(t)).toBeNull();
    }
    expect(searchTerm("3d 2048")).toBe("3d 2048");
  });
});

describe("cleanSurface", () => {
  it("keeps known discovery surfaces and collection slugs", () => {
    for (const s of ["hero", "picks", "home", "search", "tag", "related", "direct", "collection", "collection:make-some-noise"]) {
      expect(cleanSurface(s)).toBe(s);
    }
  });
  it("drops anything else", () => {
    for (const s of ["", "sponsored", "Home", "collection:", "collection:Bad Slug", "hero ", 42, null, undefined]) {
      expect(cleanSurface(s)).toBeNull();
    }
  });
});
