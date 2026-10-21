// Fails when migrations/ has duplicate or non-sequential numbers, or when an
// already-merged migration was edited. Two branches can each add 0004_*.sql without
// a git conflict, and D1 would then apply only one of them.
// Usage: node scripts/check-migrations.mjs [base-ref]
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
const errors = [];
const seen = new Map();
files.forEach((file, i) => {
  const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) return errors.push(`${file}: name must look like 0001_description.sql`);
  const n = Number(match[1]);
  if (seen.has(n)) errors.push(`${file}: number ${match[1]} already used by ${seen.get(n)}`);
  seen.set(n, file);
  if (n !== i + 1) errors.push(`${file}: expected number ${String(i + 1).padStart(4, "0")} (no gaps)`);
});

const base = process.argv[2];
if (base) {
  const changed = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`, "--", "migrations/"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  for (const [status, file] of changed) {
    if (status !== "A") errors.push(`${file}: applied migrations are append-only (status ${status}); add a new file instead`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`migrations ok (${files.length})`);
