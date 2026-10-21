import { describe, expect, it } from "vitest";
import { authorCommentCheck, commentModTransition, roleChangeCheck } from "../../src/lib/moderation";
import { timeAgo } from "../../src/lib/util";
import { commentBody, validateHandle, validateProfile } from "../../src/lib/validation";

describe("validateHandle", () => {
  it("normalizes case and a leading @", () => {
    expect(validateHandle("@Ada-Dev")).toEqual({ ok: true, value: "ada-dev" });
  });
  it.each(["ab", "-ada", "ada_", "a".repeat(25), "ada dev", "ádá", "../x"])("rejects %s", (h) => {
    expect(validateHandle(h).ok).toBe(false);
  });
  it("refuses reserved and official-looking handles", () => {
    expect(validateHandle("admin")).toMatchObject({ ok: false, error: expect.stringContaining("reserved") });
    expect(validateHandle("TrySomething").ok).toBe(false);
  });
});

describe("validateProfile", () => {
  it("keeps text plain and flattens line breaks in the bio", () => {
    const r = validateProfile({ name: "  Ada  Lovelace ", handle: "ada", bio: "Line one\nline <b>two</b>", website: "" });
    expect(r).toEqual({ ok: true, value: { name: "Ada Lovelace", handle: "ada", bio: "Line one line <b>two</b>", website: null } });
  });
  it("accepts only public https websites", () => {
    expect(validateProfile({ name: "A", handle: "ada", website: "javascript:alert(1)" })).toMatchObject({ ok: false, errors: { website: expect.any(String) } });
    expect(validateProfile({ name: "A", handle: "ada", website: "http://localhost:8080" }).ok).toBe(false);
  });
});

describe("commentBody", () => {
  it("keeps line breaks but at most one blank line", () => {
    expect(commentBody("one\r\n\r\n\r\n\r\ntwo  \n three")).toEqual({ ok: true, value: "one\n\ntwo\nthree" });
  });
  it("strips control and bidi characters and caps the length", () => {
    const r = commentBody(`hi‮evil\u0007 ${"x".repeat(2000)}`);
    expect(r.ok && r.value.startsWith("hievil x")).toBe(true);
    expect(r.ok && r.value.length).toBe(1000);
  });
  it("rejects near-empty comments", () => {
    expect(commentBody("  \n ").ok).toBe(false);
  });
});

describe("comment moderation", () => {
  const mod = { role: "moderator" };
  it("needs a moderator and a reason to hide", () => {
    expect(commentModTransition({ role: "user" }, { status: "visible" }, "hide", "spam spam")).toMatchObject({ ok: false, status: 403 });
    expect(commentModTransition(mod, { status: "visible" }, "hide", "")).toMatchObject({ ok: false, status: 400 });
    expect(commentModTransition(mod, { status: "visible" }, "hide", "Spam link")).toEqual({ ok: true, to: "hidden" });
  });
  it("only restores hidden comments, never deleted ones", () => {
    expect(commentModTransition(mod, { status: "hidden" }, "restore", "")).toEqual({ ok: true, to: "visible" });
    expect(commentModTransition(mod, { status: "deleted" }, "restore", "")).toMatchObject({ ok: false, status: 409 });
  });
  it("lets authors change only their own visible comments", () => {
    expect(authorCommentCheck("u1", { user_id: "u1", status: "visible" }).ok).toBe(true);
    expect(authorCommentCheck("u2", { user_id: "u1", status: "visible" })).toMatchObject({ ok: false, status: 403 });
    expect(authorCommentCheck("u1", { user_id: "u1", status: "hidden" })).toMatchObject({ ok: false, status: 409 });
    expect(authorCommentCheck("u1", { user_id: null, status: "visible" }).ok).toBe(false);
  });
});

describe("roleChangeCheck", () => {
  const admin = { id: "a", role: "admin" };
  it("is admin-only and never self-service", () => {
    expect(roleChangeCheck({ id: "m", role: "moderator" }, { id: "u", role: "user" }, "moderator")).toMatchObject({ ok: false, status: 403 });
    expect(roleChangeCheck(admin, admin, "user")).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects unknown roles and no-op changes", () => {
    expect(roleChangeCheck(admin, { id: "u", role: "user" }, "owner")).toMatchObject({ ok: false, status: 400 });
    expect(roleChangeCheck(admin, { id: "u", role: "user" }, "user")).toMatchObject({ ok: false, status: 409 });
    expect(roleChangeCheck(admin, { id: "u", role: "user" }, "moderator")).toEqual({ ok: true });
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  it.each([
    ["2026-10-22T11:59:30Z", "just now"],
    ["2026-10-22T11:59:00Z", "1 minute ago"],
    ["2026-10-22T09:00:00Z", "3 hours ago"],
    ["2026-10-20T12:00:00Z", "2 days ago"],
    ["2025-10-01T12:00:00Z", "1 year ago"],
  ])("%s → %s", (iso, label) => {
    expect(timeAgo(iso, now)).toBe(label);
  });
});
