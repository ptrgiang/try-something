import { describe, expect, it } from "vitest";
import { rssXml } from "../../src/lib/feed";

describe("rssXml", () => {
  it("lists tools with absolute links and escapes text", () => {
    const xml = rssXml([{ slug: "a-b", name: "Tom & Jerry <3", tagline: "Chase.", try_this: "Run.", published_at: "2026-10-27T10:00:00Z" }]);
    expect(xml).toContain("<link>https://trysometh.ing/tools/a-b</link>");
    expect(xml).toContain("<title>Tom &amp; Jerry &lt;3</title>");
    expect(xml).toContain("<description>Chase. Try this: Run.</description>");
    expect(xml).toContain("<pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate>");
  });

  it("is a valid empty channel when there are no tools", () => {
    const xml = rssXml([]);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
    expect(xml).not.toContain("lastBuildDate");
  });
});
