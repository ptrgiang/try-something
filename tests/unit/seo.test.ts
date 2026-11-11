import { describe, expect, it } from "vitest";
import { collectionIndexLd, pageTitle, robotsTxt, TITLE_MAX, toolPageLd } from "../../src/lib/seo";

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

describe("structured data", () => {
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
