// Server-side validation for submission input. All user text is stored as plain text and
// escaped on render; nothing here is ever injected as HTML.

import { canonicalKey, cleanUrl, parseUserUrl, UnsafeUrlError } from "./url";

export const CATEGORIES = [
  { id: "create", label: "Create", noun: "creative tool", blurb: "Draw, compose, generate and make things right in your browser." },
  { id: "build", label: "Build", noun: "developer tool", blurb: "Developer tools for code, data and the web that work without an install." },
  { id: "play", label: "Play", noun: "browser game", blurb: "Small games and toys you can start playing in a few seconds." },
  { id: "learn", label: "Learn", noun: "interactive explainer", blurb: "Interactive explainers and playgrounds that teach by doing." },
  { id: "design", label: "Design", noun: "design tool", blurb: "Generators and tools for colors, shapes, type and images." },
  { id: "productivity", label: "Productivity", noun: "productivity tool", blurb: "Focused little apps for timers, notes, to-dos and getting things done." },
  { id: "utilities", label: "Utilities", noun: "web utility", blurb: "Handy single-purpose helpers that convert, compress, share and fix files in a click." },
  { id: "business", label: "Business", noun: "business tool", blurb: "Tools for running a small business or side project: invoices, pitches, branding and numbers." },
  { id: "fun", label: "Fun", noun: "web toy", blurb: "Delightful odds and ends of the web, worth a minute of your time." },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export interface SubmissionInput {
  origin: "made" | "found";
  url: string;
  canonicalKey: string;
  name: string;
  tagline: string;
  tryThis: string;
  why: string;
  category: Category;
  tags: string[];
  makerName: string | null;
  makerUrl: string | null;
}

export type FieldErrors = Partial<Record<keyof SubmissionInput | "form" | "cover", string>>;

export function plainText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

export function parseTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  const tags = raw
    .split(/[,\s#]+/)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24))
    .filter((t) => t.length >= 2);
  return [...new Set(tags)].slice(0, 5);
}

export function validateSubmission(
  data: Record<string, unknown>,
): { ok: true; value: SubmissionInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const origin = data.origin === "made" || data.origin === "found" ? data.origin : null;
  if (!origin) errors.origin = "Tell us whether you made this or found it.";

  let url = "";
  let key = "";
  try {
    const parsed = parseUserUrl(String(data.url ?? ""));
    url = cleanUrl(parsed);
    key = canonicalKey(parsed);
  } catch (e) {
    errors.url = e instanceof UnsafeUrlError ? e.message : "Enter a valid https:// URL.";
  }

  const name = plainText(data.name, 60);
  if (name.length < 2) errors.name = "Add the product name.";
  const tagline = plainText(data.tagline, 120);
  if (tagline.length < 8) errors.tagline = "Add a one-line description (8+ characters).";
  const tryThis = plainText(data.tryThis, 200);
  if (tryThis.length < 10) errors.tryThis = "Describe what someone can try in 30 seconds.";
  const why = plainText(data.why, 400);
  const category = CATEGORY_IDS.includes(String(data.category)) ? (String(data.category) as Category) : null;
  if (!category) errors.category = "Pick a category.";
  const tags = parseTags(data.tags);

  const makerName = plainText(data.makerName, 80) || null;
  let makerUrl: string | null = null;
  if (typeof data.makerUrl === "string" && data.makerUrl.trim()) {
    try {
      makerUrl = cleanUrl(parseUserUrl(data.makerUrl));
    } catch {
      errors.makerUrl = "Maker link must be a public https:// URL.";
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { origin: origin!, url, canonicalKey: key, name, tagline, tryThis, why, category: category!, tags, makerName, makerUrl },
  };
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "tool"
  );
}

// ---------- Profiles ----------

// Handles live at /users/<handle>; names that read as official or collide with routes are refused.
const RESERVED_HANDLES = new Set([
  "admin", "administrator", "api", "about", "collections", "contribute", "explore", "help", "hello", "login", "logout",
  "me", "media", "mod", "moderator", "null", "official", "privacy", "root", "settings", "staff", "submit", "support",
  "surprise", "team", "terms", "tools", "trysomething", "try-something", "trysometh", "undefined", "users",
]);

export function validateHandle(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const handle = typeof value === "string" ? value.trim().toLowerCase().replace(/^@/, "") : "";
  if (!/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/.test(handle)) {
    return { ok: false, error: "Use 3–24 letters, numbers, - or _, starting and ending with a letter or number." };
  }
  if (RESERVED_HANDLES.has(handle)) return { ok: false, error: "That handle is reserved. Try another one." };
  return { ok: true, value: handle };
}

export interface ProfileInput {
  name: string;
  handle: string;
  bio: string | null;
  website: string | null;
}

export function validateProfile(
  data: Record<string, unknown>,
): { ok: true; value: ProfileInput } | { ok: false; errors: Partial<Record<keyof ProfileInput, string>> } {
  const errors: Partial<Record<keyof ProfileInput, string>> = {};
  const name = plainText(data.name, 50).replace(/\s+/g, " ");
  if (name.length < 1) errors.name = "Add the name you want shown.";
  const handle = validateHandle(data.handle);
  if (!handle.ok) errors.handle = handle.error;
  const bio = plainText(data.bio, 160).replace(/\s+/g, " ") || null;
  let website: string | null = null;
  if (typeof data.website === "string" && data.website.trim()) {
    try {
      website = cleanUrl(parseUserUrl(data.website));
    } catch {
      errors.website = "Website must be a public https:// URL.";
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, handle: (handle as { value: string }).value, bio, website } };
}

// ---------- Comments and reports ----------

export const COMMENT_MAX = 1000;

/** Comment text: plain text with line breaks kept (at most one blank line in a row). */
export function commentBody(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const body = plainText(typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value, COMMENT_MAX)
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  if (body.length < 2) return { ok: false, error: "Write a little more." };
  return { ok: true, value: body };
}

export const REPORT_REASONS = [
  { id: "spam", label: "Spam or advertising" },
  { id: "abuse", label: "Harassment or hateful" },
  { id: "misleading", label: "Misleading or unsafe" },
  { id: "broken", label: "Broken or wrong link" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_REASON_IDS: readonly string[] = REPORT_REASONS.map((r) => r.id);

export interface ToolUpdateInput {
  note: string;
  tagline: string;
  tryThis: string;
  why: string;
}

/** A maker's product update: what changed, plus the listing text as it should read afterwards. */
export function parseToolUpdate(data: Record<string, unknown>): { ok: true; value: ToolUpdateInput } | { ok: false; errors: Record<string, string>; value: ToolUpdateInput } {
  const value = {
    note: plainText(data.note, 300),
    tagline: plainText(data.tagline, 120),
    tryThis: plainText(data.tryThis, 200),
    why: plainText(data.why, 400),
  };
  const errors: Record<string, string> = {};
  if (value.note.length < 10) errors.note = "Say what changed (10+ characters).";
  if (value.tagline.length < 8) errors.tagline = "Add a one-line description (8+ characters).";
  if (value.tryThis.length < 10) errors.tryThis = "Describe what someone can try in 30 seconds.";
  return Object.keys(errors).length ? { ok: false, errors, value } : { ok: true, value };
}
