// What each in-site notification says and where it leads. Rows come from listNotifications in db.ts.

import { STATUS_LABELS, type SubmissionStatus } from "./moderation";

export type NotificationKind = "submission" | "comment_reply" | "tool_comment";

/** Submission statuses the submitter is told about; the rest are their own actions or routine. */
export const NOTIFY_STATUSES: readonly SubmissionStatus[] = ["needs_changes", "published", "rejected"];

export const NOTIFICATION_DAYS = 90;

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  status: string | null;
  created_at: string;
  read_at: string | null;
  submission_id: string | null;
  submission_name: string | null;
  moderator_note: string | null;
  comment_id: string | null;
  comment_body: string | null;
  actor_name: string | null;
  tool_slug: string | null;
  tool_name: string | null;
  tool_credit: string | null;
}

export interface NotificationView {
  id: string;
  unread: boolean;
  icon: "check" | "flag" | "close" | "chat";
  title: string;
  /** Moderator note or a snippet of the comment; plain text. */
  detail: string | null;
  href: string;
  /** A tool that just went live, for the celebration on the notifications page; `made` gates the badge. */
  live?: { slug: string; name: string; made: boolean };
  created_at: string;
}

const snippet = (s: string | null, max = 140) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t) : null;
};

export function notificationView(n: NotificationRow): NotificationView | null {
  const base = { id: n.id, unread: !n.read_at, created_at: n.created_at };
  if (n.kind === "submission") {
    const name = n.submission_name ?? "Your submission";
    if (n.status === "published") {
      return { ...base, icon: "check", title: `${name} is live`, detail: null, href: n.tool_slug ? `/tools/${n.tool_slug}` : "/me/submissions", live: n.tool_slug ? { slug: n.tool_slug, name: n.tool_name ?? name, made: n.tool_credit === "made" } : undefined };
    }
    if (n.status === "needs_changes" || n.status === "rejected") {
      const label = STATUS_LABELS[n.status].toLowerCase();
      return {
        ...base,
        icon: n.status === "rejected" ? "close" : "flag",
        title: n.status === "rejected" ? `${name} was not accepted` : `${name} ${label}`,
        detail: snippet(n.moderator_note),
        href: n.submission_id ? `/me/submissions/${n.submission_id}` : "/me/submissions",
      };
    }
    return null;
  }
  if (!n.tool_slug || !n.comment_id) return null;
  const who = n.actor_name ?? "Someone";
  const title = n.kind === "comment_reply" ? `${who} replied to your comment on ${n.tool_name}` : `${who} commented on ${n.tool_name}`;
  return { ...base, icon: "chat", title, detail: snippet(n.comment_body), href: `/tools/${n.tool_slug}#c-${n.comment_id}` };
}

export const unreadLabel = (n: number) => (n > 9 ? "9+" : String(n));
