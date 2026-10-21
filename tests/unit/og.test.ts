import { describe, expect, it } from "vitest";
import { categoryCard, clip, collectionCard, ogPath, ogTree, ogVersion, tagCard, toolCard, type OgNode } from "../../src/lib/og";

const tool = (id: string, cover = false) => ({ id, slug: id, name: `Tool ${id}`, tagline: "Does a thing.", image_url: cover ? "https://x.test/a.png" : null });

const texts = (n: OgNode | string): string[] =>
  typeof n === "string" ? [n] : typeof n.props.children === "string" ? [n.props.children] : (n.props.children ?? []).flatMap(texts);
const images = (n: OgNode | string): string[] =>
  typeof n === "string" ? [] : [...(n.props.src ? [n.props.src] : []), ...(Array.isArray(n.props.children) ? n.props.children.flatMap(images) : [])];

describe("share cards", () => {
  it("builds tool, tag, category and collection cards", () => {
    expect(toolCard(tool("a", true), "Design")).toMatchObject({ kind: "tool", id: "a", eyebrow: "Design", title: "Tool a", tools: [{ id: "a", hasCover: true }] });
    expect(tagCard("svg", 1, [tool("a")]).eyebrow).toBe("Tag · 1 tool");
    expect(categoryCard("design", 5, [1, 2, 3, 4, 5].map((i) => tool(String(i))))?.tools).toHaveLength(4);
    expect(categoryCard("nope", 1, [])).toBeNull();
    expect(collectionCard({ slug: "c", title: "C", description: null, tools: [] }).eyebrow).toBe("Collection · 0 tools");
  });

  it("changes version and URL only when what's drawn changes", () => {
    const a = tagCard("svg", 2, [tool("a"), tool("b")]);
    expect(ogVersion(a)).toBe(ogVersion(tagCard("svg", 2, [tool("a"), tool("b")])));
    expect(ogVersion(a)).not.toBe(ogVersion(tagCard("svg", 3, [tool("a"), tool("b")])));
    expect(ogVersion(a)).not.toBe(ogVersion(tagCard("svg", 2, [tool("a"), tool("b", true)])));
    expect(ogPath(a)).toMatch(/^\/og\/tag\/svg\.png\?v=[a-z0-9]+$/);
  });

  it("lays out text and uses covers when given, generated art otherwise", () => {
    const card = tagCard("svg", 2, [tool("a", true), tool("b")]);
    const tree = ogTree(card, new Map([["a", "data:image/jpeg;base64,AAAA"]]));
    expect(texts(tree)).toEqual(expect.arrayContaining(["#svg", "Tag · 2 tools", "Tool b"]));
    expect(images(tree)).toContain("data:image/jpeg;base64,AAAA");
    expect(() => ogTree(collectionCard({ slug: "c", title: "Empty", description: null, tools: [] }))).not.toThrow();
  });

  it("clips long text with an ellipsis", () => {
    expect(clip("  short  text ", 20)).toBe("short text");
    expect(clip("a".repeat(30), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
