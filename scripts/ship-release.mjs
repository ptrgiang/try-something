#!/usr/bin/env node
/**
 * Publishes the GitHub Release for the version in package.json. Run it as the LAST step of a production
 * deploy, after the deploy (and any smoke check) succeeded:
 *
 *   wrangler deploy && node scripts/ship-release.mjs
 *
 * Works on Cloudflare Workers Builds, GitHub Actions or a laptop. No dependencies (Node 20+).
 * Idempotent: if the release for this version exists it does nothing, so every deploy can call it and only
 * deploys that bumped the version create a release.
 *
 * Environment:
 *   GITHUB_TOKEN        fine-grained token, this repository only, "Contents: Read and write" (required)
 *   GITHUB_REPOSITORY   owner/repo (defaults to package.json "repository" or the git remote)
 *   WORKERS_CI_BRANCH / GITHUB_REF_NAME   when set and not the production branch, nothing is published
 *   WORKERS_CI_COMMIT_SHA / GITHUB_SHA    commit to tag (defaults to git HEAD)
 * Flags: --strict  exit 1 when the release cannot be published (default: warn, exit 0, because the deploy
 *                  itself already succeeded); --dry-run  print what would be published.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getSection, releaseTitle, sectionNotes, sectionSummary, titleProblems } from "./lib/changelog.mjs";

const strict = process.argv.includes("--strict");
const dryRun = process.argv.includes("--dry-run");

function out(msg) {
  console.log(`ship-release: ${msg}`);
}
function problem(msg) {
  console.error(`ship-release: ${msg}`);
  process.exit(strict ? 1 : 0);
}
function tryGit(...a) {
  try {
    return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;
const productionBranch = pkg.ship?.productionBranch ?? "main";
const branch = process.env.WORKERS_CI_BRANCH || process.env.GITHUB_REF_NAME || tryGit("rev-parse", "--abbrev-ref", "HEAD");

if (!/^\d+\.\d+\.\d+$/.test(version) || version === "0.0.0") {
  out(`version ${version} is not releasable yet (first release is 0.1.0); skipping`);
  process.exit(0);
}
if (branch && branch !== productionBranch) {
  out(`branch ${branch} is not ${productionBranch}; skipping`);
  process.exit(0);
}

const repo =
  process.env.GITHUB_REPOSITORY ||
  (typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "").replace(/^github:/, "").replace(/^.*github\.com[/:]/, "").replace(/\.git$/, "") ||
  tryGit("remote", "get-url", "origin").replace(/^.*github\.com[/:]/, "").replace(/\.git$/, "");
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) problem(`cannot tell the GitHub repository (got "${repo}"); set GITHUB_REPOSITORY`);

const section = getSection(readFileSync("CHANGELOG.md", "utf8"), version);
if (!section) problem(`CHANGELOG.md has no ## [${version}] section; run npm run ship`);
const summary = sectionSummary(section.body);
if (!summary) problem(`## [${version}] has no summary line (first paragraph); add one`);
const title = releaseTitle(version, summary);
const issues = titleProblems(title);
if (issues.length) problem(`release title "${title}": ${issues.join("; ")}`);
const body = sectionNotes(section.body) || summary;
const sha = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || tryGit("rev-parse", "HEAD");
const tag = `v${version}`;

if (dryRun) {
  out(`would publish ${repo} ${tag} at ${sha || "HEAD"}\n  title: ${title}\n  notes:\n${body}`);
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN;
if (!token) problem("GITHUB_TOKEN is not set (fine-grained, Contents: Read and write on this repository)");

const api = `https://api.github.com/repos/${repo}`;
const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "ship-release",
};

const existing = await fetch(`${api}/releases/tags/${tag}`, { headers });
if (existing.ok) {
  out(`${tag} already released; nothing to do`);
  process.exit(0);
}
if (existing.status !== 404) problem(`GitHub API ${existing.status} checking ${tag}: ${(await existing.text()).slice(0, 200)}`);

const res = await fetch(`${api}/releases`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ tag_name: tag, target_commitish: sha || productionBranch, name: title, body, draft: false, prerelease: false, make_latest: "true" }),
});
if (!res.ok) problem(`GitHub API ${res.status} creating ${tag}: ${(await res.text()).slice(0, 300)}`);
const created = await res.json();
out(`published ${created.html_url}`);
