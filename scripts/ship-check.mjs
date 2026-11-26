#!/usr/bin/env node
/**
 * npm run ship:check: checks this repository against the Ship Standard before it is integrated into
 * Ship Something. Read-only, no dependencies, works in any product repository (copy scripts/ into it).
 *
 * Checks what can be checked from code: release rules (S), and whether analytics (V) and payments (R) are
 * wired the standard way. Account-side items (Polar token, PostHog key for Ship) are listed as reminders.
 * Exit code 1 when a MUST rule fails.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { getSection, parseChangelog, releaseTitle, sectionSummary, titleProblems } from "./lib/changelog.mjs";

const results = [];
const add = (id, level, ok, text, hint = "") => results.push({ id, level, ok, text, hint });
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

/** Source files to scan, skipping dependencies and build output. */
function sourceFiles(dir = ".", out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", "build", ".wrangler", ".svelte-kit", ".astro", "coverage", ".next"].includes(name)) continue;
    // Forward slashes on every OS, so the scripts/ exclusions below also hold on Windows.
    const p = join(dir, name).replace(/\\/g, "/");
    if (p === "scripts/ship-check.mjs") continue; // its own patterns would match themselves
    const st = statSync(p);
    if (st.isDirectory()) sourceFiles(p, out);
    else if ([".ts", ".tsx", ".js", ".mjs", ".jsx", ".svelte", ".astro", ".html", ".json", ".jsonc", ".toml", ".py", ".vue"].includes(extname(name)) && st.size < 512_000)
      out.push(p);
  }
  return out;
}
const files = sourceFiles();
const grep = (re) => files.filter((f) => re.test(readFileSync(f, "utf8")));

// --- Ship (GitHub releases)
const pkg = read("package.json") ? JSON.parse(read("package.json")) : null;
const changelog = read("CHANGELOG.md");
add("S6", "SHOULD", !!pkg && /^\d+\.\d+\.\d+$/.test(pkg.version ?? ""), "package.json has a MAJOR.MINOR.PATCH version", "add a root package.json with \"version\"");
add("S5", "SHOULD", !!changelog && /^## \[Unreleased\]/m.test(changelog), "CHANGELOG.md with ## [Unreleased] (Keep a Changelog)");
if (pkg && changelog && pkg.version !== "0.0.0") {
  const section = getSection(changelog, pkg.version);
  add("S6", "SHOULD", !!section, `CHANGELOG.md has a ## [${pkg.version}] section matching package.json`);
  const summary = section ? sectionSummary(section.body) : null;
  add("S3", "MUST", !!summary && titleProblems(releaseTitle(pkg.version, summary)).length === 0, `release title for v${pkg.version} is valid`, "first paragraph under the version heading = one-line summary, no em dash");
  const versions = parseChangelog(changelog).sections.map((s) => s.version).filter((v) => /^\d/.test(v));
  add("S4", "MUST", versions.includes("0.1.0") || versions.length === 0, "v0.1.0 marks the first public release (launch)", "backfill a 0.1.0 section with the launch date");
}
const releaseWired = grep(/ship-release\.mjs|ship:release/).filter((f) => !f.includes("ship-check.mjs") && !f.endsWith("ship-release.mjs"));
add("S7", "MUST", releaseWired.length > 0, "the production deploy runs scripts/ship-release.mjs", "append `&& node scripts/ship-release.mjs` to the production deploy command");

// --- Visitors (PostHog)
const posthog = grep(/posthog|SHIP_ANALYTICS/i).filter((f) => !f.includes("scripts/"));
add("V1", "MUST", posthog.length > 0, "PostHog is loaded (ship-analytics.js or posthog-js)");
add("V2", "MUST", grep(/product_id|productId:\s*["']/).some((f) => posthog.includes(f) || /SHIP_ANALYTICS/.test(readFileSync(f, "utf8"))), "product_id is registered on every event");
add("V3", "MUST", grep(/ft_utm_|ship-analytics/).length > 0, "first-touch (ft_utm_*) and last-touch (utm_*) UTMs are captured");
add("V5", "MUST", grep(/identified_only|ship-analytics/).length > 0, "person_profiles: identified_only (no anonymous person profiles)");

// --- Revenue (Polar), only when the product sells
const sells = grep(/polar\.sh|@polar-sh|POLAR_ACCESS_TOKEN/i).length > 0;
if (sells) {
  add("R2", "MUST", grep(/posthog_distinct_id/).length > 0 && grep(/pricing_stage/).length > 0, "checkout metadata has product_id, pricing_stage, posthog_distinct_id, utm_*, ft_utm_*");
  add("R3", "MUST", grep(/webhook-signature|validateEvent|verifyStandardWebhook|standardwebhooks/i).length > 0, "fulfilment comes from a verified Polar webhook");
  add("R7", "SHOULD", grep(/purchase_completed/).length > 0, "purchase_completed is captured server-side from the webhook");
} else {
  add("R1", "INFO", true, "no Polar code found: revenue will show as Not connected until the product sells through Polar");
}

// --- Report
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "ok  " : r.level === "MUST" ? "FAIL" : "warn";
  if (!r.ok && r.level === "MUST") failed++;
  console.log(`${mark}  ${r.id.padEnd(3)} ${r.level.padEnd(6)} ${r.text}${!r.ok && r.hint ? `\n            → ${r.hint}` : ""}`);
}
console.log(`
Also needed outside the code (owner, in each service):
  - GitHub: Ship Something's read-only token can read this repository (S8)
  - PostHog: a personal API key with Query Read for Ship Something (V6)
  - Polar: an orders:read Organization Access Token and a webhook to https://ship.trysometh.ing/api/webhooks/polar/<product id> (R5)
`);
if (failed) {
  console.log(`${failed} MUST rule(s) failing. See https://github.com/ptrgiang/ship/blob/main/docs/SHIP_STANDARD.md`);
  process.exit(1);
}
console.log("Ship Standard: all MUST rules pass.");
