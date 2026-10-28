import { describe, expect, it } from "vitest";
import { feedbackPage, parseFeedback } from "../../src/lib/feedback";

const form = (v: Record<string, string>) => ({ get: (k: string) => v[k] ?? null });

describe("parseFeedback", () => {
  it("accepts a kind, a message and a same-site page", () => {
    const r = parseFeedback(form({ kind: "tool", message: "  The link 404s  ", page: "/tools/sandspiel" }));
    expect(r).toEqual({ ok: true, value: { kind: "tool", message: "The link 404s", page: "/tools/sandspiel" } });
  });

  it("rejects an unknown kind or an empty message", () => {
    expect(parseFeedback(form({ kind: "spam", message: "hello there" })).ok).toBe(false);
    expect(parseFeedback(form({ kind: "idea", message: " hi " })).ok).toBe(false);
  });
});

describe("feedbackPage", () => {
  it("keeps only paths on this site", () => {
    expect(feedbackPage("/explore?q=json")).toBe("/explore?q=json");
    expect(feedbackPage("https://evil.example/")).toBeNull();
    expect(feedbackPage("//evil.example/")).toBeNull();
    expect(feedbackPage("/a<script>")).toBeNull();
  });
});
