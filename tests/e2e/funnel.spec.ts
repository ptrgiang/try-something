import { expect, test } from "@playwright/test";
import { createUser, sql, sqlJson } from "./helpers";

// The visitor-day discovery funnel: dedup per step, attribution to source and place, and what never counts.
test.describe.configure({ mode: "serial" });

const SRC = "e2e-funnel";
const today = () => new Date().toISOString().slice(0, 10);
const reset = () =>
  sql(`
    DELETE FROM visit_day; DELETE FROM funnel_source_daily; DELETE FROM funnel_surface_daily;
    DELETE FROM app_rate_limit WHERE key LIKE 'pv%' OR key LIKE 'f_:%' OR key LIKE 'tries:%' OR key LIKE 'views:%' OR key LIKE 'imp:%' OR key LIKE 'tryer:%';
  `);
const source = (name: string) =>
  sqlJson<{ visits: number; engaged: number; tried: number; medium: string; campaign: string }>(
    `SELECT visits, engaged, tried, medium, campaign FROM funnel_source_daily WHERE day = '${today()}' AND source = '${name}'`,
  )[0] ?? { visits: 0, engaged: 0, tried: 0, medium: "", campaign: "" };
const place = (surface: string) =>
  sqlJson<{ engaged: number; tried: number }>(`SELECT engaged, tried FROM funnel_surface_daily WHERE day = '${today()}' AND surface = '${surface}'`)[0] ?? {
    engaged: 0,
    tried: 0,
  };

test.beforeAll(reset);
test.afterAll(() => sql(`DELETE FROM "user" WHERE id = 'e2e-f-mod'; DELETE FROM tool_stat_daily WHERE tool_id = 'seed-silk' AND day = '${today()}';`));

test("each step counts a visitor once a day, credited to the UTM source and the place", async ({ page, context }) => {
  await page.goto(`/explore?q=draw&utm_source=${SRC}&utm_medium=email&utm_campaign=wk43`);
  await expect.poll(() => source(SRC).visits).toBe(1);
  expect(source(SRC)).toMatchObject({ medium: "email", campaign: "wk43", tried: 0 });

  // Another page load the same day is the same visit.
  await page.reload();
  await page.waitForTimeout(800);
  expect(source(SRC).visits).toBe(1);

  const kleki = page.locator(".grid .card", { hasText: "Kleki" });
  await kleki.scrollIntoViewIfNeeded();
  await expect.poll(() => source(SRC).engaged, { timeout: 15000 }).toBe(1);
  expect(place("search").engaged).toBe(1);

  const popup = context.waitForEvent("page");
  await kleki.locator(".card-host").click();
  await (await popup).close();
  // Polling reads the local SQLite file from another process; give the beacon's writes a moment so they don't
  // collide (SQLITE_BUSY), which only happens with the local test database.
  await page.waitForTimeout(1000);
  await expect.poll(() => source(SRC).tried).toBe(1);
  expect(place("search")).toEqual({ engaged: 1, tried: 1 });

  // A second tool tried counts for the tool, but the visitor-day funnel is already complete.
  const jspaint = page.locator(".grid .card", { hasText: "JS Paint" });
  const again = context.waitForEvent("page");
  await jspaint.locator(".card-host").click();
  await (await again).close();
  await page.waitForTimeout(1000);
  await expect
    .poll(() => sqlJson<{ n: number }>(`SELECT COALESCE(SUM(tries), 0) AS n FROM tool_stat_daily WHERE tool_id = 'seed-jspaint' AND day = '${today()}'`)[0].n)
    .toBeGreaterThan(0);
  expect(source(SRC)).toMatchObject({ visits: 1, engaged: 1, tried: 1 });
  expect(place("search")).toEqual({ engaged: 1, tried: 1 });
});

test("a tool reached through Surprise me is credited to Surprise me", async ({ page }) => {
  const surpriseViews = () =>
    sqlJson<{ n: number }>(`SELECT COALESCE(SUM(views), 0) AS n FROM surface_stat_daily WHERE day = '${today()}' AND surface = 'surprise'`)[0].n;
  const before = surpriseViews();
  await page.goto("/tools/kleki");
  await page.getByRole("link", { name: "Another one" }).first().click();
  await expect(page).toHaveURL(/\/tools\/(?!kleki)[^/]+$/);
  await expect.poll(() => place("surprise").engaged).toBe(1);
  expect(surpriseViews()).toBe(before + 1);
});

test("signed-in staff aren't counted", async ({ page }) => {
  reset();
  const mod = await createUser("e2e-f-mod", "Fun Nel", "moderator");
  await page.context().addCookies([{ ...mod.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/?utm_source=e2e-staff");
  const card = page.locator("[data-home-list] .card").first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  expect(source("e2e-staff").visits).toBe(0);
  expect(sqlJson<{ n: number }>(`SELECT COUNT(*) AS n FROM visit_day`)[0].n).toBe(0);
  expect(place("home").engaged).toBe(0);
});

test("the stats screen shows empty states, the environment, and unattributed tries", async ({ page }) => {
  reset();
  sql(`INSERT INTO tool_stat_daily (tool_id, day, tries) VALUES ('seed-silk', '${today()}', 3) ON CONFLICT (tool_id, day) DO UPDATE SET tries = tries + 3;`);
  const mod = await createUser("e2e-f-mod", "Fun Nel", "moderator");
  await page.context().addCookies([{ ...mod.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/admin/stats?days=7");
  await expect(page.getByRole("note")).toContainText("Not production data");
  const funnel = page.getByRole("region", { name: "Discovery funnel" });
  await expect(funnel.getByText("No funnel data in this period")).toBeVisible();
  await expect(funnel.getByRole("row", { name: /Unattributed/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Acquisition" }).getByText("No visits with a known funnel")).toBeVisible();
  await expect(page.getByRole("region", { name: "Retention" })).toContainText("Signed-out retention is unavailable");
});
