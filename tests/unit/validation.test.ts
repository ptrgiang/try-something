import { describe, expect, it } from "vitest";
import { LIST_TITLE_MAX, parseList, parseTags, parseToolUpdate, plainText, slugify, TEXT_LIMITS, validateSubmission } from "../../src/lib/validation";

const good = {
  origin: "found",
  url: "https://www.haikei.app/?utm_source=x",
  name: "Haikei",
  tagline: "Generate SVG backgrounds",
  tryThis: "Click randomize and export an SVG",
  why: "",
  category: "design",
  tags: "svg, #Generative, svg, a, way-too-long-tag-that-goes-on-and-on",
  makerName: "",
  makerUrl: "",
};

describe("validateSubmission", () => {
  it("accepts a valid submission and normalizes it", () => {
    const r = validateSubmission(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe("https://www.haikei.app/");
    expect(r.value.canonicalKey).toBe("haikei.app");
    expect(r.value.tags).toEqual(["svg", "generative", "way-too-long-tag-that-go"]);
    expect(r.value.makerUrl).toBeNull();
  });

  it("requires origin, real fields and a known category", () => {
    const r = validateSubmission({ ...good, origin: "admin", name: "x", category: "crypto", tryThis: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["category", "name", "origin", "tryThis"]);
  });

  it("rejects unsafe URLs for product and maker links", () => {
    const r = validateSubmission({ ...good, url: "http://192.168.0.1/admin", makerUrl: "javascript:alert(1)" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.url).toBeTruthy();
    expect(r.errors.makerUrl).toBeTruthy();
  });

  it("keeps HTML as inert text (escaped on render) and strips bidi/control characters", () => {
    expect(plainText("<img src=x onerror=alert(1)>‮\u0000 hi", 100)).toBe("<img src=x onerror=alert(1)> hi");
  });

  it("caps lengths", () => {
    expect(plainText("a".repeat(500), 60)).toHaveLength(60);
  });

  it("refuses over-long listing text instead of cutting it mid-sentence", () => {
    const long = "Look for Octopus Boy near his little cave on the sand, he crawls around and chases the food. ".repeat(3);
    const r = validateSubmission({ ...good, tryThis: long, tagline: "x".repeat(TEXT_LIMITS.tagline + 1), makerName: "m".repeat(81) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.tryThis).toBe(`Keep this to ${TEXT_LIMITS.tryThis} characters or fewer (it's ${long.trim().length} now).`);
    expect(r.errors.tagline).toContain(`${TEXT_LIMITS.tagline} characters or fewer`);
    expect(r.errors.makerName).toBeTruthy();
  });

  it("accepts text exactly at the limit, counting it after whitespace is tidied", () => {
    const r = validateSubmission({ ...good, tagline: "y".repeat(TEXT_LIMITS.tagline), why: `  ${"w".repeat(TEXT_LIMITS.why)}  ` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tagline).toHaveLength(TEXT_LIMITS.tagline);
  });

  it("refuses an over-long product update and hands the full text back", () => {
    const why = "z".repeat(TEXT_LIMITS.why + 5);
    const r = parseToolUpdate({ note: "Now exports PNG files.", tagline: "Generate SVG backgrounds", tryThis: "Click randomize and export", why });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.why).toContain("(it's 405 now)");
    expect(r.value.why).toBe(why);
  });
});

describe("helpers", () => {
  it("parseTags dedupes and caps at 5", () => {
    expect(parseTags("a1,b2,c3,d4,e5,f6")).toHaveLength(5);
  });
  it("slugify", () => {
    expect(slugify("Ray.so — Code Images!")).toBe("ray-so-code-images");
    expect(slugify("✨✨")).toBe("tool");
    expect(slugify("Café Déjà")).toBe("cafe-deja");
  });
});

describe("parseList", () => {
  it("needs a name, keeps text plain and on one line", () => {
    expect(parseList({ title: "  ", description: "" })).toEqual({ ok: false, error: "Give the list a name." });
    expect(parseList({ title: " Tools\n for   my band ", description: " For rehearsals. " })).toEqual({ ok: true, value: { title: "Tools for my band", description: "For rehearsals." } });
    expect(parseList({ title: 42 })).toMatchObject({ ok: false });
  });

  it("rejects names and descriptions over the limits instead of cutting them", () => {
    expect(parseList({ title: "x".repeat(LIST_TITLE_MAX) }).ok).toBe(true);
    expect(parseList({ title: "x".repeat(LIST_TITLE_MAX + 1) }).ok).toBe(false);
    expect(parseList({ title: "ok", description: "y".repeat(281) }).ok).toBe(false);
  });
});
