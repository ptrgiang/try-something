import { expect, test, type Page } from "@playwright/test";
import { BASE, createUser, sql, sqlJson, type TestUser } from "./helpers";

// Site analytics: the page-view beacon, what it leaves out, and the /admin/stats screen.
let reader: TestUser;
let mod: TestUser;
const TAG = "e2e-stats";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Every e2e run comes from one IP; reset its daily windows so the first visit below counts as a new visitor.
  sql(`DELETE FROM app_rate_limit WHERE key LIKE 'pv:%' OR key LIKE 'pv-first:%'; DELETE FROM source_stat_daily WHERE source = '${TAG}'; DELETE FROM visit_day;`);
  // A fresh id per run: the server remembers accounts already marked active today.
  reader = await createUser(`e2e-s-reader-${Date.now()}`, "Rae Reader", "user");
  mod = await createUser("e2e-s-mod", "Mo Stats", "moderator");
});

test.afterAll(() => {
  sql(`DELETE FROM source_stat_daily WHERE source = '${TAG}'; DELETE FROM "user" WHERE id LIKE 'e2e-s-%';`);
});

async function signIn(page: Page, user: TestUser) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...user.cookie, httpOnly: true, sameSite: "Lax" }]);
}

const today = () => new Date().toISOString().slice(0, 10);
const pageViews = (path: string) =>
  sqlJson<{ n: number }>(`SELECT COALESCE(SUM(views), 0) AS n FROM page_stat_daily WHERE day = '${today()}' AND path = '${path}'`)[0]?.n ?? 0;
const sourceVisitors = () => sqlJson<{ n: number }>(`SELECT COALESCE(SUM(visitors), 0) AS n FROM source_stat_daily WHERE source = '${TAG}'`)[0]?.n ?? 0;

test("a page load counts once, with its source; staff pages send nothing", async ({ page }) => {
  await page.context().clearCookies();
  const before = pageViews("/about");
  await page.goto(`/about?utm_source=${TAG}`);
  await expect.poll(() => pageViews("/about")).toBe(before + 1);
  await expect.poll(sourceVisitors).toBe(1);

  // A second page the same day adds a view but not another visitor.
  await page.goto(`/explore?utm_source=${TAG}`);
  await expect.poll(() => pageViews("/explore")).toBeGreaterThan(0);
  expect(sourceVisitors()).toBe(1);

  await signIn(page, mod);
  const beacons: string[] = [];
  page.on("request", (r) => r.url().endsWith("/api/pv") && beacons.push(r.url()));
  await page.goto("/admin/stats");
  await page.goto("/me/settings");
  await page.waitForTimeout(500);
  expect(beacons).toEqual([]);
});

test("forged paths are refused and signed-in visits mark the account active", async ({ page, request }) => {
  const origin = new URL(BASE).origin;
  const forged = await request.post("/api/pv", { data: { path: "/admin/users" }, headers: { origin } });
  expect(forged.status()).toBe(400);
  const crossSite = await request.post("/api/pv", { data: { path: "/" }, headers: { origin: "https://evil.example" } });
  expect(crossSite.status()).toBe(403);

  sql(`DELETE FROM user_active_day WHERE user_id = '${reader.id}';`);
  await signIn(page, reader);
  await page.goto("/");
  await expect.poll(() => sqlJson<{ n: number }>(`SELECT COUNT(*) AS n FROM user_active_day WHERE user_id = '${reader.id}'`)[0].n).toBe(1);
});

test("only moderators see the stats screen", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/admin/stats");
  await expect(page).toHaveURL(/\/login\?next=\/admin\/stats/);

  await signIn(page, reader);
  const res = await page.goto("/admin/stats");
  expect(res?.status()).toBe(403);

  // Top pages lists only the busiest few, so give one path a count no other test can reach.
  sql(`INSERT INTO page_stat_daily (day, path, views) VALUES (date('now'), '/e2e-top-page', 100000)
       ON CONFLICT (day, path) DO UPDATE SET views = 100000;`);
  await signIn(page, mod);
  await page.goto("/admin/stats?days=7");
  await expect(page.getByRole("heading", { name: "Stats", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".stat-tile", { hasText: "Visitor-days" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Acquisition" }).getByRole("table")).toContainText(TAG);
  await expect(page.locator("#stats-pages + .table-wrap")).toContainText("/e2e-top-page");
  await expect(page.getByRole("img", { name: /Visitors per day/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retention" })).toBeVisible();
});
