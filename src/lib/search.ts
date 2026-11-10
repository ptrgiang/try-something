// Turns an /explore query into per-word patterns. Every kept word must match somewhere in a tool (AND), each
// through any of its forms (OR), so "compress svg" finds a tool that says "Shrink SVG files".

export interface SearchTerm {
  /** LIKE pattern for the word as typed (stemmed); used for ranking, so exact words beat synonyms. */
  primary: string;
  /** LIKE patterns, primary first, that count as a match for this word. */
  patterns: string[];
}

export interface ParsedQuery {
  /** LIKE pattern for the whole query, for the "name contains it all" bonus. */
  phrase: string;
  terms: SearchTerm[];
}

// Keeps the bound parameters well under D1's 100 per query once ranking and filters add theirs.
export const MAX_TERMS = 5;
const MAX_PATTERNS = 6;

const STOP_WORDS = new Set([
  "a", "an", "and", "app", "apps", "best", "by", "for", "free", "from", "how", "i", "in", "into", "is", "it",
  "make", "me", "my", "of", "on", "online", "or", "site", "some", "something", "the", "to", "tool", "tools",
  "website", "with", "your",
]);

// Prefix stems: a word belongs to a group when it starts with one of them. Keep groups tight; a loose one
// floods results with tools that only share a vague verb.
const SYNONYMS: string[][] = [
  ["compress", "shrink", "optimiz", "optimis", "minif", "smaller"],
  ["convert", "transform"],
  ["draw", "sketch", "doodle", "paint", "illustrat"],
  ["image", "photo", "picture", "img"],
  ["color", "colour", "palette"],
  ["font", "typeface", "typograph", "lettering"],
  ["music", "song", "melod"],
  ["sound", "audio"],
  ["video", "film", "movie"],
  ["background", "wallpaper", "backdrop"],
  ["diagram", "flowchart", "chart"],
  ["learn", "tutorial", "lesson"],
];

const SUFFIXES = ["ing", "ion", "ers", "er", "or", "ed", "es", "s"];

/** Light stemming that only ever shortens to a prefix, so the stem still matches the original by substring. */
export function stem(word: string): string {
  if (!/^[a-z]+$/.test(word)) return word;
  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix)) continue;
    if (suffix === "s" && word.endsWith("ss")) continue;
    const base = word.slice(0, -suffix.length);
    // A bare plural may leave three letters ("svgs"); longer suffixes may not ("notes" is not "not").
    if (base.length >= (suffix === "s" ? 3 : 4)) return base;
  }
  return word;
}

/**
 * Two-letter words match whole words and three-letter ones a word start ("ai" must not hit "email" or
 * "airbrush"); the text is space-padded with punctuation turned into spaces (SEARCH_TEXT in db.ts).
 */
export function likePattern(text: string): string {
  const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`);
  if (text.length <= 2) return `% ${escaped} %`;
  return text.length === 3 ? `% ${escaped}%` : `%${escaped}%`;
}

function words(q: string): string[] {
  return q
    .normalize("NFKC")
    .toLowerCase()
    // Same separators SEARCH_TEXT turns into spaces, so "node.js" and "open-source" line up with the text.
    .split(/[\s,;:/|()[\]"'.-]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}#+]+|[^\p{L}\p{N}#+]+$/gu, ""))
    .filter(Boolean);
}

export function parseQuery(q: string): ParsedQuery | null {
  const all = [...new Set(words(q))];
  if (!all.length) return null;
  let kept = all.filter((w) => !STOP_WORDS.has(w) && w.length >= 2);
  // "free tools" or "a" still searches for something rather than everything.
  if (!kept.length) kept = all;
  const terms = kept.slice(0, MAX_TERMS).map((word) => {
    const base = stem(word);
    const forms = [base];
    for (const group of SYNONYMS) {
      if (group.some((s) => word.startsWith(s) || base.startsWith(s))) forms.push(...group);
    }
    const patterns = [...new Set(forms)].slice(0, MAX_PATTERNS).map(likePattern);
    return { primary: patterns[0], patterns };
  });
  return { phrase: likePattern(all.join(" ")), terms };
}
