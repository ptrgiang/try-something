import { describe, expect, it } from "vitest";
import { parseTags, plainText, slugify, validateSubmission } from "../../src/lib/validation";

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
