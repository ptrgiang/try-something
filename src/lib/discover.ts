// Discovery sessions (/discover): a mood narrows the categories, then tools come one at a time, three per round.
// The session lives in the URL (mood, step, seen), so it needs no account, cookie or script.

export const SESSION_LENGTH = 3;
const SEEN_MAX = 40;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const MOODS = [
  { id: "anything", label: "Surprise me with anything", hint: "Any corner of the catalog", categories: null },
  { id: "make", label: "Make something", hint: "Drawing, design and creative tools", categories: ["create", "design"] },
  { id: "play", label: "Play something", hint: "Games and web toys", categories: ["play", "fun"] },
  { id: "learn", label: "Learn something", hint: "Interactive explainers", categories: ["learn"] },
  { id: "work", label: "Get something done", hint: "Developer tools, utilities and helpers", categories: ["build", "productivity", "utilities", "business"] },
] as const;
export type Mood = (typeof MOODS)[number];

export function parseMood(raw: string | null): Mood | null {
  return MOODS.find((m) => m.id === raw) ?? null;
}

/** Slugs already shown this session, newest last; invalid entries dropped and the list capped. */
export function parseSeen(raw: string | null): string[] {
  return [...new Set((raw ?? "").split(",").filter((s) => SLUG.test(s)))].slice(-SEEN_MAX);
}

/** 1-based position within the current round of SESSION_LENGTH. */
export function parseStep(raw: string | null): number {
  const n = Math.trunc(Number(raw));
  return n >= 1 && n <= SESSION_LENGTH ? n : 1;
}

export function discoverUrl(mood: string, step: number, seen: string[]): string {
  const q = new URLSearchParams({ mood, step: String(step) });
  if (seen.length) q.set("seen", seen.slice(-SEEN_MAX).join(","));
  return `/discover?${q}`;
}
