// Test-only helpers: create users and sessions directly in the LOCAL D1 database and sign the
// session cookie with the local BETTER_AUTH_SECRET. No test backdoor exists in the app itself.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:48731";

// Same scheme Better Auth uses for signed cookies: `${value}.${base64(HMAC-SHA256(secret, value))}`.
async function signCookie(value: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value));
  return `${value}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

function secret(): string {
  const vars = readFileSync(".dev.vars", "utf8");
  const m = vars.match(/^BETTER_AUTH_SECRET=(.+)$/m);
  if (!m) throw new Error("BETTER_AUTH_SECRET missing from .dev.vars");
  return m[1].trim();
}

// wrangler d1 execute --local now and then fails while the dev server holds the database; a retry clears it.
function wrangler(args: string[]): string {
  const run = () =>
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "d1", "execute", "DB", "--local", ...args], {
      stdio: "pipe",
      shell: process.platform === "win32",
    }).toString();
  for (let attempt = 1; ; attempt++) {
    try {
      return run();
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
}

export function sql(statements: string): void {
  const dir = mkdtempSync(join(tmpdir(), "ts-e2e-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, statements);
  wrangler([`--file=${file}`]);
}

export function sqlJson<T>(query: string): T[] {
  // Only the Windows path goes through a shell, so only it needs the query quoted.
  const command = process.platform === "win32" ? JSON.stringify(query) : query;
  const out = wrangler(["--json", `--command=${command}`]);
  return JSON.parse(out)[0].results as T[];
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

export interface TestUser {
  id: string;
  name: string;
  cookie: { name: string; value: string; url: string };
}

export async function createUser(id: string, name: string, role: "user" | "moderator" | "admin"): Promise<TestUser> {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 86400000).toISOString();
  const token = `e2e-${id}-${crypto.randomUUID()}`;
  sql(`
    DELETE FROM "session" WHERE "userId" = ${q(id)};
    INSERT OR REPLACE INTO "user" ("id","name","email","emailVerified","image","createdAt","updatedAt","role")
      VALUES (${q(id)}, ${q(name)}, ${q(`${id}@e2e.invalid`)}, 1, NULL, ${q(now)}, ${q(now)}, ${q(role)});
    INSERT INTO "session" ("id","expiresAt","token","createdAt","updatedAt","ipAddress","userAgent","userId")
      VALUES (${q(`sess-${id}`)}, ${q(expires)}, ${q(token)}, ${q(now)}, ${q(now)}, '127.0.0.1', 'e2e', ${q(id)});
  `);
  const value = encodeURIComponent(await signCookie(token, secret()));
  return { id, name, cookie: { name: "better-auth.session_token", value, url: BASE } };
}

export function cleanup(): void {
  sql(`
    DELETE FROM tool WHERE submission_id IN (SELECT id FROM submission WHERE name LIKE 'E2E %');
    DELETE FROM submission WHERE name LIKE 'E2E %';
    DELETE FROM feedback WHERE message LIKE 'E2E %';
    DELETE FROM app_rate_limit;
    DELETE FROM "rateLimit";
  `);
}
