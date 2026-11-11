import { describe, expect, it } from "vitest";
import { collectionIndexLd, collectionLd, countedTitle, pageTitle, robotsTxt, tagHeading, TITLE_MAX, toolPageLd } from "../../src/lib/seo";

const disallowed = (txt: string) => [...txt.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1]);
const blocked = (txt: string, path: string) => disallowed(txt).some((rule) => path.startsWith(rule));

describe("robotsTxt", () => {
  const txt = robotsTxt(true);

  it("keeps account and staff routes out of the crawl", () => {
    for (const path of ["/admin", "/admin/tools", "/me/saved", "/api/search", "/login?next=/", "/submit", "/feedback?from=/", "/surprise"]) {
      expect(blocked(txt, path), path).toBe(true);
    }
    expect(txt).toContain("Sitemap: https://trysometh.ing/sitemap.xml");
  });

  it("does not block public routes that share a prefix with a private one", () => {
    for (const path of ["/", "/media/tool/abc", "/og/tool/abc.png", "/tools/abc", "/tags/svg", "/explore", "/users/me", "/about", "/feed.xml"]) {
      expect(blocked(txt, path), path).toBe(false);
    }
  });

  it("closes everything outside production", () => {
    expect(robotsTxt(false)).toBe("User-agent: *\nDisallow: /\n");
  });
});

describe("pageTitle", () => {
  it("adds the brand while the title still fits a search result", () => {
    expect(pageTitle("About")).toBe("About - Try Something");
    expect(pageTitle()).toBe("Try Something - Discover tools worth trying");
  });

  it("drops the brand instead of overflowing", () => {
    const fits = "x".repeat(TITLE_MAX - " - Try Something".length);
    expect(pageTitle(fits)).toHaveLength(TITLE_MAX);
    expect(pageTitle(`${fits}x`)).toBe(`${fits}x`);
  });
});

describe("countedTitle", () => {
  it("says how many there are, in fewer words as the heading grows", () => {
    expect(countedTitle("Online whiteboards", 2)).toBe("Online whiteboards: 2 to try in your browser");
    expect(countedTitle("Fun websites to visit when you're bored", 12)).toBe("Fun websites to visit when you're bored: 12 to try");
    const long = "A collection title that already fills a search result line";
    expect(countedTitle(long, 9)).toBe(long);
  });
  it("never builds a title a search result would cut", () => {
    for (const len of [20, 33, 34, 35, 50, 51, 52, 60]) expect(countedTitle("x".repeat(len), 10).length).toBeLessThanOrEqual(TITLE_MAX);
  });
});

describe("tagHeading", () => {
  it("turns a tag into a readable heading", () => {
    expect(tagHeading("drawing")).toBe("Drawing tools");
    expect(tagHeading("open-source")).toBe("Open source tools");
    expect(tagHeading("svg")).toBe("SVG tools");
    expect(tagHeading("ai")).toBe("AI tools");
    expect(tagHeading("3d-print")).toBe("3D print tools");
  });
});

describe("structured data", () => {
  it("dates a collection page only when the dates are known", () => {
    const base = { path: "/collections/a", name: "A", tools: [{ slug: "t", name: "T" }] };
    const dated = collectionLd({ ...base, published: "2026-11-01T00:00:00.000Z", modified: "2026-11-10T00:00:00.000Z" }) as any;
    expect(dated.datePublished).toBe("2026-11-01T00:00:00.000Z");
    expect(dated.dateModified).toBe("2026-11-10T00:00:00.000Z");
    expect(collectionLd(base)).not.toHaveProperty("dateModified");
  });
  it("lists collections by their own pages", () => {
    const ld = collectionIndexLd({ path: "/collections", name: "Collections", description: "Sets.", items: [{ path: "/collections/a", name: "A" }] }) as any;
    expect(ld.mainEntity.itemListElement).toEqual([{ "@type": "ListItem", position: 1, url: "https://trysometh.ing/collections/a", name: "A" }]);
  });

  it("ties a tool page to its application node", () => {
    const ld = toolPageLd({ path: "/tools/a", name: "A", description: "D.", published: "2026-10-27T00:00:00Z", modified: "2026-11-01T00:00:00Z", about: "https://trysometh.ing/tools/a#app" }) as any;
    expect(ld["@id"]).toBe("https://trysometh.ing/tools/a#page");
    expect(ld.mainEntity).toEqual({ "@id": "https://trysometh.ing/tools/a#app" });
    expect(ld.dateModified).toBe("2026-11-01T00:00:00Z");
  });
});
