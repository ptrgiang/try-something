import { describe, expect, it } from "vitest";
import { badgeEmbed, badgeSvg, pickBadge } from "../../src/lib/badges";

describe("pickBadge", () => {
  const verified = { status: "published", maker_verified_at: "2026-10-22T00:00:00Z" };
  it("serves the verified badge only for a published, verified tool", () => {
    expect(pickBadge(verified, "verified", "dark")).toEqual({ style: "verified", theme: "dark" });
    expect(pickBadge({ ...verified, maker_verified_at: null }, "verified", null).style).toBe("pill");
    expect(pickBadge({ ...verified, status: "removed" }, "verified", null).style).toBe("pill");
    expect(pickBadge(null, "verified", null).style).toBe("pill");
  });
  it("falls back to the light pill for unknown values", () => {
    expect(pickBadge(verified, "sticker", "neon")).toEqual({ style: "pill", theme: "light" });
  });
});

describe("badgeSvg", () => {
  it("draws text as paths so it renders the same without web fonts", () => {
    for (const style of ["pill", "verified"] as const)
      for (const theme of ["light", "dark"] as const) {
        const svg = badgeSvg(style, theme);
        expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
        expect(svg).not.toMatch(/<text|<script|href=/);
      }
  });
});

describe("badgeEmbed", () => {
  it("links to the official listing with UTM tags and escapes the tool name", () => {
    const e = badgeEmbed({ slug: "haikei", name: `A "b" <c> [d]` }, "pill", "dark");
    expect(e.href).toBe("https://trysometh.ing/tools/haikei?utm_source=badge&utm_medium=referral&utm_campaign=maker-badge");
    expect(e.src).toBe("https://trysometh.ing/badge/haikei.svg?style=pill&theme=dark");
    expect(e.html).toContain(`alt="A &quot;b&quot; &lt;c&gt; [d] on Try Something" width="182" height="44"`);
    expect(e.html).toContain("&amp;utm_medium=referral");
    expect(e.markdown).toBe(`[![A "b" <c> \\[d\\] on Try Something](${e.src})](${e.href})`);
  });
});
