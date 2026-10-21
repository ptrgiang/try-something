// Fails when the index holds something that shouldn't be published: stray top-level
// files or folders, images outside public/ and docs/assets/, oversized files, or text
// that looks like a credential, a personal address or an account-specific host.
// Extra terms (names, private hosts) can live in .git/info/forbidden-words, one per
// line; that file is never committed, so the terms themselves stay out of the repo.
// Usage: node scripts/check-repo.mjs (runs in CI and in the .githooks/pre-commit hook)
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT_DIRS = new Set([".github", ".githooks", "db", "docs", "migrations", "public", "scripts", "src", "tests"]);
const ROOT_FILES = new Set([
  ".dev.vars.example", ".gitattributes", ".gitignore", ".node-version",
  "AGENTS.md", "CHANGELOG.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "LICENSE", "README.md",
  "ROADMAP.md", "SECURITY.md", "TRADEMARK.md",
  "astro.config.mjs", "package-lock.json", "package.json", "playwright.config.ts", "tsconfig.json",
  "vitest.config.ts", "wrangler.jsonc",
]);
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|mp4|webm|mov|pdf|zip|gz|woff2?|ttf|otf|sqlite3?|db)$/i;
const BINARY_HOME = /^(public|docs\/assets)\//;
const MAX_BYTES = 256 * 1024;
const BIG_OK = new Set(["package-lock.json"]);

const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/, "GitHub token"],
  [/\bsk-(ant-)?[A-Za-z0-9_-]{24,}/, "API key"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS key"],
  // The real staging host contains the account subdomain; docs use <account-subdomain>.
  [/\b[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/i, "account-specific workers.dev host"],
  [/[A-Za-z0-9._%+-]+@(gmail|googlemail|yahoo|outlook|hotmail|icloud|proton(mail)?)\.(com|me)\b/i, "personal email address"],
];

const git = (args) => execFileSync("git", args, { encoding: "utf8" });
const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const wordsFile = git(["rev-parse", "--git-path", "info/forbidden-words"]).trim();
const words = existsSync(wordsFile)
  ? readFileSync(wordsFile, "utf8").split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter((w) => w && !w.startsWith("#"))
  : [];

const errors = [];
for (const file of files) {
  const [top, ...rest] = file.split("/");
  if (rest.length ? !ROOT_DIRS.has(top) : !ROOT_FILES.has(top)) {
    errors.push(`${file}: not an expected top-level path (add it to scripts/check-repo.mjs if it belongs)`);
  }
  if (!existsSync(file)) continue; // staged deletion
  const size = statSync(file).size;
  if (size > MAX_BYTES && !BIG_OK.has(file)) errors.push(`${file}: ${Math.round(size / 1024)} KB is over the ${MAX_BYTES / 1024} KB limit`);
  if (BINARY.test(file)) {
    if (!BINARY_HOME.test(file)) errors.push(`${file}: binary files belong in public/ or docs/assets/`);
    continue;
  }
  if (file === "package-lock.json") continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [re, what] of PATTERNS) if (re.test(line)) errors.push(`${file}:${i + 1}: possible ${what}`);
    const lower = line.toLowerCase();
    for (const w of words) if (lower.includes(w)) errors.push(`${file}:${i + 1}: contains a term from ${wordsFile}`);
  });
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`repo ok (${files.length} files${words.length ? `, ${words.length} local terms` : ""})`);
