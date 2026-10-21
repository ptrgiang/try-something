import { describe, expect, it } from "vitest";
import { moderatorTransition, ownerCanEdit, ownerTransition, type SubmissionStatus } from "../../src/lib/moderation";

const mod = { id: "mod-1", role: "moderator" };
const admin = { id: "admin-1", role: "admin" };
const user = { id: "user-1", role: "user" };
const sub = (status: SubmissionStatus, user_id = "user-1") => ({ status, user_id });

describe("moderatorTransition", () => {
  it("lets moderators and admins approve pending or in-review submissions", () => {
    expect(moderatorTransition(mod, sub("pending"), "approve", "")).toEqual({ ok: true, to: "published" });
    expect(moderatorTransition(admin, sub("in_review"), "approve", "")).toEqual({ ok: true, to: "published" });
  });

  it("forbids regular users", () => {
    expect(moderatorTransition(user, sub("pending", "someone"), "approve", "")).toMatchObject({ ok: false, status: 403 });
  });

  it("forbids role values the server doesn't know", () => {
    expect(moderatorTransition({ id: "x", role: "ADMIN" }, sub("pending"), "approve", "")).toMatchObject({ ok: false, status: 403 });
  });

  it("forbids moderating your own submission", () => {
    expect(moderatorTransition(mod, sub("pending", "mod-1"), "approve", "")).toMatchObject({ ok: false, status: 403 });
  });

  it("requires a reason for request_changes and reject", () => {
    expect(moderatorTransition(mod, sub("pending"), "reject", " ")).toMatchObject({ ok: false, status: 400 });
    expect(moderatorTransition(mod, sub("pending"), "request_changes", "Broken link on mobile")).toEqual({ ok: true, to: "needs_changes" });
  });

  it("rejects invalid transitions", () => {
    expect(moderatorTransition(mod, sub("published"), "approve", "")).toMatchObject({ ok: false, status: 409 });
    expect(moderatorTransition(mod, sub("withdrawn"), "start_review", "")).toMatchObject({ ok: false, status: 409 });
    expect(moderatorTransition(mod, sub("needs_changes"), "approve", "")).toMatchObject({ ok: false, status: 409 });
    // @ts-expect-error unknown action from a tampered form
    expect(moderatorTransition(mod, sub("pending"), "delete_everything", "")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("ownerTransition", () => {
  it("only the owner can resubmit/withdraw", () => {
    expect(ownerTransition("user-1", sub("needs_changes"), "resubmit")).toEqual({ ok: true, to: "pending" });
    expect(ownerTransition("user-2", sub("needs_changes"), "resubmit")).toMatchObject({ ok: false, status: 403 });
    expect(ownerTransition("user-1", sub("pending"), "withdraw")).toEqual({ ok: true, to: "withdrawn" });
    expect(ownerTransition("user-1", sub("published"), "withdraw")).toMatchObject({ ok: false, status: 409 });
  });

  it("published/rejected submissions are not editable by the owner", () => {
    expect(ownerCanEdit("published")).toBe(false);
    expect(ownerCanEdit("rejected")).toBe(false);
    expect(ownerCanEdit("needs_changes")).toBe(true);
  });
});
