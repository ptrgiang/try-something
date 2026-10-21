// Submission status machine. Every transition is checked server-side here.

export type SubmissionStatus = "pending" | "in_review" | "needs_changes" | "published" | "rejected" | "withdrawn";
export type Role = "user" | "moderator" | "admin";
export type ModeratorAction = "start_review" | "request_changes" | "approve" | "reject";
export type OwnerAction = "resubmit" | "withdraw";

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  needs_changes: "Needs changes",
  published: "Published",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const MODERATOR_TRANSITIONS: Record<ModeratorAction, { from: SubmissionStatus[]; to: SubmissionStatus; needsReason: boolean }> = {
  start_review: { from: ["pending"], to: "in_review", needsReason: false },
  request_changes: { from: ["pending", "in_review"], to: "needs_changes", needsReason: true },
  approve: { from: ["pending", "in_review"], to: "published", needsReason: false },
  reject: { from: ["pending", "in_review", "needs_changes"], to: "rejected", needsReason: true },
};

const OWNER_TRANSITIONS: Record<OwnerAction, { from: SubmissionStatus[]; to: SubmissionStatus }> = {
  resubmit: { from: ["needs_changes"], to: "pending" },
  withdraw: { from: ["pending", "needs_changes"], to: "withdrawn" },
};

export function isModerator(role: string | null | undefined): boolean {
  return role === "moderator" || role === "admin";
}

export type TransitionResult = { ok: true; to: SubmissionStatus } | { ok: false; status: 400 | 403 | 409; error: string };

export function moderatorTransition(
  actor: { id: string; role: string },
  submission: { user_id: string; status: SubmissionStatus },
  action: ModeratorAction,
  reason: string,
): TransitionResult {
  if (!isModerator(actor.role)) return { ok: false, status: 403, error: "Moderator role required." };
  const rule = MODERATOR_TRANSITIONS[action];
  if (!rule) return { ok: false, status: 400, error: "Unknown action." };
  if (submission.user_id === actor.id) {
    return { ok: false, status: 403, error: "You can't moderate your own submission." };
  }
  if (!rule.from.includes(submission.status)) {
    return { ok: false, status: 409, error: `Can't ${action.replace("_", " ")} a submission that is ${STATUS_LABELS[submission.status]}.` };
  }
  if (rule.needsReason && reason.trim().length < 5) {
    return { ok: false, status: 400, error: "Add a reason the submitter can act on." };
  }
  return { ok: true, to: rule.to };
}

export function ownerTransition(
  actorId: string,
  submission: { user_id: string; status: SubmissionStatus },
  action: OwnerAction,
): TransitionResult {
  if (submission.user_id !== actorId) return { ok: false, status: 403, error: "Not your submission." };
  const rule = OWNER_TRANSITIONS[action];
  if (!rule) return { ok: false, status: 400, error: "Unknown action." };
  if (!rule.from.includes(submission.status)) {
    return { ok: false, status: 409, error: `Can't ${action} a submission that is ${STATUS_LABELS[submission.status]}.` };
  }
  return { ok: true, to: rule.to };
}

export function ownerCanEdit(status: SubmissionStatus): boolean {
  return status === "needs_changes" || status === "pending";
}

// ---------- Comments ----------

export type CommentStatus = "visible" | "hidden" | "deleted";
export type CommentModAction = "hide" | "restore";

const COMMENT_MOD_TRANSITIONS: Record<CommentModAction, { from: CommentStatus[]; to: CommentStatus; needsReason: boolean }> = {
  hide: { from: ["visible"], to: "hidden", needsReason: true },
  restore: { from: ["hidden"], to: "visible", needsReason: false },
};

export type CommentTransition = { ok: true; to: CommentStatus } | { ok: false; status: 400 | 403 | 409; error: string };

export function commentModTransition(
  actor: { role: string },
  comment: { status: CommentStatus },
  action: CommentModAction,
  reason: string,
): CommentTransition {
  if (!isModerator(actor.role)) return { ok: false, status: 403, error: "Moderator role required." };
  const rule = COMMENT_MOD_TRANSITIONS[action];
  if (!rule) return { ok: false, status: 400, error: "Unknown action." };
  if (!rule.from.includes(comment.status)) return { ok: false, status: 409, error: `This comment is already ${comment.status}.` };
  if (rule.needsReason && reason.trim().length < 5) return { ok: false, status: 400, error: "Add a reason for the audit log." };
  return { ok: true, to: rule.to };
}

/** Authors edit or delete only their own comments, and never one a moderator has hidden. */
export function authorCommentCheck(actorId: string, comment: { user_id: string | null; status: CommentStatus }): CommentTransition {
  if (!comment.user_id || comment.user_id !== actorId) return { ok: false, status: 403, error: "Not your comment." };
  if (comment.status !== "visible") return { ok: false, status: 409, error: "This comment can't be changed any more." };
  return { ok: true, to: "visible" };
}

/** Distinct open reports that hide a comment until a moderator looks at it. */
export const AUTO_HIDE_REPORTS = 3;

// ---------- Roles ----------

export function roleChangeCheck(actor: { id: string; role: string }, target: { id: string; role: string }, to: string): TransitionResult | { ok: true } {
  if (actor.role !== "admin") return { ok: false, status: 403, error: "Only admins change roles." };
  if (actor.id === target.id) return { ok: false, status: 403, error: "You can't change your own role." };
  if (!["user", "moderator", "admin"].includes(to)) return { ok: false, status: 400, error: "Unknown role." };
  if (target.role === to) return { ok: false, status: 409, error: "That user already has this role." };
  return { ok: true };
}

// ---------- Product updates ----------

/** Updates a maker can send per tool in UPDATE_WINDOW_DAYS, so editing can't become a way to stay on top. */
export const UPDATE_LIMIT = 3;
export const UPDATE_WINDOW_DAYS = 30;
/** A tool is resurfaced in Picks at most once in this many days, however many updates it gets. */
export const RESURFACE_COOLDOWN_DAYS = 90;

export type UpdateCheck = { ok: true } | { ok: false; status: 403 | 409 | 429; error: string };

/** Only the person who listed a tool as its maker can post updates to it, one waiting at a time. */
export function updateCheck(
  userId: string,
  tool: { status: string; submitted_by: string | null; credit_type: string | null },
  recent: number,
  pending: boolean,
): UpdateCheck {
  if (tool.status !== "published" || tool.submitted_by !== userId || tool.credit_type !== "made") {
    return { ok: false, status: 403, error: "Only the maker who listed this tool can post updates." };
  }
  if (pending) return { ok: false, status: 409, error: "An update for this tool is already waiting for review." };
  if (recent >= UPDATE_LIMIT) return { ok: false, status: 429, error: `You can post ${UPDATE_LIMIT} updates per tool every ${UPDATE_WINDOW_DAYS} days.` };
  return { ok: true };
}

export function canResurface(refreshedAt: string | null, now = Date.now()): boolean {
  return !refreshedAt || now - Date.parse(refreshedAt) >= RESURFACE_COOLDOWN_DAYS * 86400000;
}
