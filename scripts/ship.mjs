#!/usr/bin/env node
/**
 * npm run ship -- <patch|minor|major|X.Y.Z> "Short summary"
 *
 * Cuts a release on main: bumps package.json, moves ## [Unreleased] into a new CHANGELOG section with the
 * summary, commits "release: vX.Y.Z" and pushes. It does NOT tag or publish anything: the production deploy
 * runs `scripts/ship-release.mjs`, which publishes the GitHub Release only after the deploy succeeded
 * (Ship release standard S1/S2). Pass --no-push to review the commit first.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { bumpVersion, cutRelease } from "./lib/changelog.mjs";

const args = process.argv.slice(2);
const noPush = args.includes("--no-push");
const [bump, ...rest] = args.filter((a) => !a.startsWith("--"));
const summary = rest.join(" ").trim();

function git(...a) {
  return execFileSync("git", a, { encoding: "utf8" }).trim();
}
function fail(msg) {
  console.error(`ship: ${msg}`);
  process.exit(1);
}

if (!bump || !summary) fail('usage: npm run ship -- <patch|minor|major|X.Y.Z> "Short summary"');
if (summary.length > 70) fail("summary must be 70 characters or fewer (it becomes the release title)");
if (git("status", "--porcelain")) fail("working tree is not clean; commit or stash first");

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
// ship.branch: where versions are cut (default: the production branch). Differs when production deploys
// from a promotion branch, e.g. cut on main, promote main to release, deploy from release.
const shipBranch = pkg.ship?.branch ?? pkg.ship?.productionBranch ?? "main";
if (branch !== shipBranch) fail(`ship from ${shipBranch} (you are on ${branch})`);

const version = bumpVersion(pkg.version, bump);
const date = new Date().toISOString().slice(0, 10);
const changelog = cutRelease(readFileSync("CHANGELOG.md", "utf8"), version, summary, date);

pkg.version = version;
writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync("CHANGELOG.md", changelog);
const files = ["package.json", "CHANGELOG.md"];
if (existsSync("package-lock.json")) {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  writeFileSync("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
  files.push("package-lock.json");
}

git("add", ...files);
git("commit", "-m", `release: v${version}`, "-m", summary);
console.log(`ship: committed v${version}: ${summary}`);
if (noPush) {
  console.log("ship: --no-push given; push when ready. The deploy publishes the release.");
} else {
  git("push", "origin", shipBranch);
  console.log(`ship: pushed. The next production deploy of this commit publishes GitHub Release v${version}.`);
}
