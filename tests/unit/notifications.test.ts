import { describe, expect, it } from "vitest";
import { notificationView, unreadLabel, type NotificationRow } from "../../src/lib/notifications";

const row = (over: Partial<NotificationRow>): NotificationRow => ({
  id: "n1",
  kind: "submission",
  status: null,
  created_at: "2026-10-22T10:00:00Z",
  read_at: null,
  submission_id: "s1",
  submission_name: "Sketch Pad",
  moderator_note: null,
  comment_id: null,
  comment_body: null,
  actor_name: null,
  tool_slug: null,
  tool_name: null,
  ...over,
});

describe("notificationView", () => {
  it("links a published submission to its tool page", () => {
    const v = notificationView(row({ status: "published", tool_slug: "sketch-pad", read_at: "2026-10-22T11:00:00Z" }));
    expect(v).toMatchObject({ title: "Sketch Pad is live", href: "/tools/sketch-pad", icon: "check", unread: false });
  });

  it("sends needs changes and rejections to the submission with the editor's note", () => {
    expect(notificationView(row({ status: "needs_changes", moderator_note: "  Add a\n working link  " }))).toMatchObject({
      title: "Sketch Pad needs changes",
      detail: "Add a working link",
      href: "/me/submissions/s1",
      unread: true,
    });
    expect(notificationView(row({ status: "rejected" }))).toMatchObject({ title: "Sketch Pad was not accepted", icon: "close", detail: null });
  });

  it("skips statuses that aren't announced", () => {
    expect(notificationView(row({ status: "in_review" }))).toBeNull();
  });

  it("describes replies and comments with a clipped snippet and a link to the comment", () => {
    const base = { submission_id: null, comment_id: "c9", tool_slug: "haikei", tool_name: "Haikei", actor_name: "Ada" };
    expect(notificationView(row({ ...base, kind: "comment_reply", comment_body: "Thanks!" }))).toMatchObject({
      title: "Ada replied to your comment on Haikei",
      detail: "Thanks!",
      href: "/tools/haikei#c-c9",
    });
    const long = notificationView(row({ ...base, kind: "tool_comment", actor_name: null, comment_body: "x".repeat(300) }));
    expect(long?.title).toBe("Someone commented on Haikei");
    expect(long?.detail).toHaveLength(140);
  });

  it("drops comment notices whose tool is gone", () => {
    expect(notificationView(row({ kind: "tool_comment", comment_id: "c9", tool_slug: null }))).toBeNull();
  });
});

it("caps the badge at 9+", () => {
  expect([1, 9, 10, 250].map(unreadLabel)).toEqual(["1", "9", "9+", "9+"]);
});
