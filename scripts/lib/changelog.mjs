/**
 * Keep a Changelog helpers shared by `ship.mjs` (cut a version) and `ship-release.mjs` (publish it).
 * Pure functions, no dependencies, so any product can copy this file.
 *
 * Convention on top of Keep a Changelog: the first paragraph under a version heading is a one-line
 * summary. It becomes the GitHub Release title `vX.Y.Z: <summary>`.
 *
 *   ## [0.4.0] - 2026-11-26
 *
 *   Search by mood
 *
 *   ### Added
 *   - ...
 */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const VERSION_HEADING = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;

export function bumpVersion(current, bump) {
  if (SEMVER.test(bump)) return bump;
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`package.json version "${current}" is not MAJOR.MINOR.PATCH`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  if (bump === "patch") return `${maj}.${min}.${pat + 1}`;
  throw new Error(`bump must be patch, minor, major or an explicit X.Y.Z (got "${bump}")`);
}

export function isNewer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

/** Splits a changelog into its version sections. */
export function parseChangelog(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = VERSION_HEADING.exec(line);
    if (h) {
      current = { version: h[1], date: h[2] ?? null, start: i, end: lines.length, body: [] };
      sections.push(current);
      continue;
    }
    // Link reference definitions at the bottom end the last section.
    if (/^\[[^\]]+\]:\s*\S+/.test(line) && current) {
      current.end = i;
      current = null;
      continue;
    }
    if (/^## /.test(line) && current) {
      current.end = i;
      current = null;
      continue;
    }
    if (current) current.body.push(line);
  }
  return { lines, sections: sections.map((s) => ({ ...s, body: s.body.join("\n").trim() })) };
}

export function getSection(text, version) {
  return parseChangelog(text).sections.find((s) => s.version === version) ?? null;
}

/** First paragraph of a section when it is plain text (not a ### heading or list). */
export function sectionSummary(body) {
  const first = body.split(/\n\s*\n/)[0]?.trim() ?? "";
  if (!first || first.startsWith("#") || first.startsWith("-") || first.startsWith("*")) return null;
  return first.replace(/\s+/g, " ");
}

/** Release notes: the section without its summary paragraph. */
export function sectionNotes(body) {
  const summary = sectionSummary(body);
  const notes = summary ? body.split(/\n\s*\n/).slice(1).join("\n\n") : body;
  return notes.trim();
}

/** Problems with a release title according to the Ship release standard (S3). */
export function titleProblems(title) {
  const problems = [];
  if (!/^v\d+\.\d+\.\d+: \S/.test(title)) problems.push('title must look like "vX.Y.Z: short summary"');
  if (/[—–]/.test(title)) problems.push("title must not contain an em or en dash");
  if (title.length > 80) problems.push("title must be 80 characters or fewer");
  return problems;
}

export function releaseTitle(version, summary) {
  return `v${version}: ${summary.replace(/\s*[—–]\s*/g, ": ").replace(/\.$/, "")}`;
}

/**
 * Moves everything under `## [Unreleased]` into a new version section with a summary line.
 * Throws when there is nothing to release.
 */
export function cutRelease(text, version, summary, date) {
  const { lines } = parseChangelog(text);
  const start = lines.findIndex((l) => /^## \[Unreleased\]\s*$/i.test(l));
  if (start === -1) throw new Error("CHANGELOG.md has no ## [Unreleased] section");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]) || /^\[[^\]]+\]:\s*\S+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const unreleased = lines.slice(start + 1, end).join("\n").trim();
  if (!unreleased) throw new Error("## [Unreleased] is empty: write what changed before shipping");
  if (/[—–]/.test(summary)) throw new Error("summary must not contain an em or en dash");
  const block = ["## [Unreleased]", "", `## [${version}] - ${date}`, "", summary.trim(), "", unreleased, ""];
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n");
}
