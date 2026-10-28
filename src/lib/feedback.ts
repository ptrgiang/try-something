// Validation for the site feedback form; storage lives in db.ts.

import { plainText } from "./validation";

export const FEEDBACK_KINDS = [
  { id: "bug", label: "Something on this site is broken" },
  { id: "tool", label: "A listed tool is broken or asks for sign-up" },
  { id: "idea", label: "An idea or suggestion" },
  { id: "other", label: "Something else" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  page: string | null;
}

/** Only a same-site path is kept as the page, so the field can't carry links or other sites' URLs. */
export function feedbackPage(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return /^\/[A-Za-z0-9/_\-.%?=&]{0,199}$/.test(s) && !s.startsWith("//") ? s : null;
}

export function parseFeedback(form: { get(name: string): unknown }): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  const kind = String(form.get("kind") ?? "");
  if (!FEEDBACK_KINDS.some((k) => k.id === kind)) return { ok: false, error: "Pick what your feedback is about." };
  const message = plainText(form.get("message"), 2000);
  if (message.length < 5) return { ok: false, error: "Add a few words so we know what happened." };
  return { ok: true, value: { kind: kind as FeedbackKind, message, page: feedbackPage(form.get("page")) } };
}
