import { describe, expect, it } from "vitest";
import { MAX_TERMS, likePattern, parseQuery, stem } from "../../src/lib/search";

describe("stem", () => {
  it("cuts common endings down to a prefix of the word", () => {
    expect(stem("compression")).toBe("compress");
    expect(stem("drawing")).toBe("draw");
    expect(stem("editor")).toBe("edit");
    expect(stem("fonts")).toBe("font");
    expect(stem("svgs")).toBe("svg");
  });

  it("leaves short or unusual words alone", () => {
    expect(stem("notes")).toBe("note");
    expect(stem("color")).toBe("color");
    expect(stem("css")).toBe("css");
    expect(stem("glass")).toBe("glass");
    expect(stem("3d")).toBe("3d");
  });
});

describe("likePattern", () => {
  it("anchors short words to word boundaries and escapes wildcards", () => {
    expect(likePattern("ai")).toBe("% ai %");
    expect(likePattern("svg")).toBe("% svg%");
    expect(likePattern("gradient")).toBe("%gradient%");
    expect(likePattern("100%_off")).toBe("%100\\%\\_off%");
  });
});

describe("parseQuery", () => {
  it("needs every word, not the whole phrase", () => {
    const q = parseQuery("compress svg");
    expect(q?.terms.map((t) => t.primary)).toEqual(["%compress%", "% svg%"]);
    expect(q?.phrase).toBe("%compress svg%");
  });

  it("lets a word match through its synonyms", () => {
    const [compress] = parseQuery("compress")!.terms;
    expect(compress.patterns).toContain("%shrink%");
    expect(compress.patterns).toContain("%optimiz%");
    expect(parseQuery("optimize")!.terms[0].patterns).toContain("%compress%");
  });

  it("drops filler words unless nothing else is left", () => {
    expect(parseQuery("a free tool to compress my images")!.terms.map((t) => t.primary)).toEqual(["%compress%", "%imag%"]);
    expect(parseQuery("free tools")!.terms.map((t) => t.primary)).toEqual(["%free%", "%tool%"]);
  });

  it("splits on the separators the searched text uses", () => {
    expect(parseQuery("node.js")!.terms.map((t) => t.primary)).toEqual(["%node%", "% js %"]);
    expect(parseQuery("open-source, (svg)")!.terms.map((t) => t.primary)).toEqual(["%open%", "%source%", "% svg%"]);
  });

  it("caps the words and ignores empty input", () => {
    expect(parseQuery("one two three four five six seven")!.terms).toHaveLength(MAX_TERMS);
    expect(parseQuery("  ... ")).toBeNull();
    expect(parseQuery("svg svg")!.terms).toHaveLength(1);
  });
});
