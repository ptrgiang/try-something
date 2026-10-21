import { expect, test } from "@playwright/test";
import { BASE, createUser, sql, sqlJson } from "./helpers";

// The home page's starting points (hero, editors' picks, list) and the discovery analytics behind them.
test.describe.configure({ mode: "serial" });

const PICKS = "e2e-picks";
const PICK_TOOLS = ["seed-silk", "seed-kleki", "seed-jspaint", "seed-tldraw"];
const today = () => new Date().toISOString().slice(0, 10);
const surfaceRow = (surface: string, toolId: string) =>
  sqlJson<{ impressions: number; views: number; tries: number }>(
    `SELECT impressions, views, tries FROM surface_stat_daily WHERE day = '${today()}' AND surface = '${surface}' AND tool_id = '${toolId}'`,
  )[0] ?? { impressions: 0, views: 0, tries: 0 };

test.beforeAll(() => {
  // Published a minute from now, so it is the newest collection whatever else the run created.
  const at = new Date(Date.now() + 60000).toISOString();
  sql(`
    DELETE FROM collection WHERE id = '${PICKS}';
    INSERT INTO collection (id, slug, title, description, status, published_at, updated_at)
      VALUES ('${PICKS}', '${PICKS}', 'Draw something now', 'Four drawing toys.', 'published', '${at}', '${at}');
    ${PICK_TOOLS.map((id, i) => `INSERT INTO collection_tool (collection_id, tool_id, position) VALUES ('${PICKS}', '${id}', ${i});`).join("\n")}
    DELETE FROM app_rate_limit WHERE key LIKE 'imp:%' OR key LIKE 'tries:%' OR key LIKE 'views:%' OR key LIKE 'tryer:%';
    DELETE FROM surface_stat_daily;
  `);
});

test.afterAll(() => {
  sql(`DELETE FROM collection WHERE id = '${PICKS}';`);
});

test("home: picks come from the newest collection and nothing repeats between hero, picks and list", async ({ page }) => {
  await page.goto("/");
  const picks = page.locator("section.picks");
  await expect(picks.getByRole("heading", { level: 2 })).toHaveText("Draw something now");
  await expect(picks.locator(".eyebrow")).toContainText("Worth trying this week");
  await expect(picks.getByRole("link", { name: "See the collection" })).toHaveAttribute("href", `/collections/${PICKS}`);

  const ids = (sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.impression!));
  const [hero, picked, list] = await Promise.all([ids(".featured .slide"), ids(".pick"), ids("[data-home-list] .card")]);
  expect(picked.length).toBeGreaterThanOrEqual(3);
  expect(list.length).toBeGreaterThan(0);
  for (const id of picked) expect(hero).not.toContain(id);
  for (const id of list) {
    expect(hero).not.toContain(id);
    expect(picked).not.toContain(id);
  }

  // A filtered list is the whole category again, featured tools included.
  await page.goto("/?category=design");
  const design = await ids("[data-home-list] .card");
  expect(design).toContain("seed-haikei");

  await page.goto("/");
  await page.getByRole("link", { name: "Share it with credit" }).click();
  await expect(page).toHaveURL(/\/submit$|\/login/);
});

test("impressions, views and tries are counted with the place the tool was found", async ({ page, context }) => {
  await page.goto("/explore?q=draw");
  const card = page.locator(".grid .card", { hasText: "Kleki" });
  await card.scrollIntoViewIfNeeded();
  // Impressions go out in a batch a couple of seconds after the card is on screen.
  await expect.poll(() => surfaceRow("search", "seed-kleki").impressions, { timeout: 15000 }).toBe(1);

  const popup = context.waitForEvent("page");
  await card.locator(".card-host").click();
  await (await popup).close();
  await expect.poll(() => surfaceRow("search", "seed-kleki").tries).toBe(1);
  await expect.poll(() => sqlJson<{ n: number }>(`SELECT tryers AS n FROM site_stat_daily WHERE day = '${today()}'`)[0]?.n ?? 0).toBe(1);

  // A second try the same day is the same visitor: no new tryer, no second try for the tool.
  const again = context.waitForEvent("page");
  await card.locator(".card-host").click();
  await (await again).close();
  await page.waitForTimeout(800);
  expect(surfaceRow("search", "seed-kleki").tries).toBe(1);
  expect(sqlJson<{ n: number }>(`SELECT tryers AS n FROM site_stat_daily WHERE day = '${today()}'`)[0].n).toBe(1);

  // Opening a tool from a tag page credits the tag page with the view, full page or quick view alike.
  await page.goto("/tags/drawing");
  await page.locator(".grid .card", { hasText: "JS Paint" }).getByRole("link", { name: "JS Paint" }).click();
  await expect.poll(() => surfaceRow("tag", "seed-jspaint").views).toBe(1);
});

test("the impressions endpoint refuses other sites and unknown places", async ({ request }) => {
  const origin = new URL(BASE).origin;
  const cross = await request.post("/api/impressions", { data: { items: [{ s: "home", t: "seed-silk" }] }, headers: { origin: "https://evil.example" } });
  expect(cross.status()).toBe(403);
  const bad = await request.post("/api/impressions", { data: { items: [{ s: "sponsored", t: "seed-silk" }] }, headers: { origin } });
  expect(bad.status()).toBe(400);
});


test("Surprise me skips tools already shown this visit", async ({ page }) => {
  await page.goto("/tools/kleki");
  const seen = new Set(["kleki"]);
  for (let n = 0; n < 8; n++) {
    await page.getByRole("link", { name: "Another one" }).first().click();
    await expect(page).toHaveURL(/\/tools\/[^/]+$/);
    const slug = new URL(page.url()).pathname.split("/").pop()!;
    expect(seen.has(slug)).toBe(false);
    seen.add(slug);
  }
});

test("makers see real numbers for their own listed tools; cards leave out zero counts", async ({ page }) => {
  const maker = await createUser("e2e-insights", "Ina Sights", "user");
  sql(`
    UPDATE tool SET submitted_by = 'e2e-insights', credit_type = 'made' WHERE id = 'seed-silk';
    INSERT INTO tool_stat_daily (tool_id, day, views, tries) VALUES ('seed-silk', date('now'), 7, 3)
      ON CONFLICT (tool_id, day) DO UPDATE SET views = views + 7, tries = tries + 3;
  `);
  try {
    const row = sqlJson<{ v: number; t: number }>(
      `SELECT SUM(views) AS v, SUM(tries) AS t FROM tool_stat_daily WHERE tool_id = 'seed-silk' AND day >= date('now', '-30 days')`,
    )[0];
    await page.context().addCookies([{ ...maker.cookie, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/me/submissions");
    const insights = page.getByRole("region", { name: "Your listed tools" });
    const silk = insights.getByRole("row", { name: /Silk/ });
    await expect(silk.locator("td").nth(2)).toHaveText(String(row.v));
    await expect(silk.locator("td").nth(3)).toHaveText(String(row.t));
    await expect(insights.getByRole("row")).toHaveCount(2);

    // A card with no saves shows no save count; the heart button stays.
    sql(`DELETE FROM bookmark WHERE tool_id = 'seed-jspaint'; DELETE FROM tool_like WHERE tool_id = 'seed-jspaint';`);
    await page.goto("/tags/drawing");
    const card = page.locator(".grid .card", { hasText: "JS Paint" });
    await expect(card.locator(".stat-like")).toBeVisible();
    await expect(card.locator(".stat-like [data-n]")).toBeHidden();
    await expect(card.locator(`[data-count="save:seed-jspaint"]`)).toBeHidden();
  } finally {
    sql(`UPDATE tool SET submitted_by = NULL, credit_type = 'editorial' WHERE id = 'seed-silk'; DELETE FROM "user" WHERE id = 'e2e-insights';`);
  }
});
