import { expect, test } from "@playwright/test";
import { createUser, sql, sqlJson } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Ctrl+K and / open quick search; arrows and Enter open a tool", async ({ page }) => {
  await page.goto("/explore");
  const palette = page.locator("[data-palette]");
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await expect(palette.locator("[data-palette-label]")).toHaveText("Trending this week");
  await page.keyboard.type("json");
  await expect(palette.locator("[role=option]").first()).toContainText("JSON Crack");
  await expect(palette.locator("[data-palette-all]")).toHaveAttribute("href", "/explore?q=json");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tools\/json-crack$/);
  // The shortcut listener is a module script; it isn't there until the new page has loaded.
  await page.waitForLoadState("load");

  await page.keyboard.press("/");
  await expect(palette).toBeVisible();
  await page.keyboard.type("draw");
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("cards link straight to the site with a counted Try", async ({ page }) => {
  await page.goto("/explore");
  const host = page.locator(".grid .card .card-host").first();
  await expect(host).toHaveAttribute("target", "_blank");
  await expect(host).toHaveAttribute("href", /^https:\/\//);
  await expect(host).toHaveAttribute("data-try", /.+/);
  // A real click on the domain opens the site in a new tab, not the quick view behind the title link.
  await page.context().route(/^https:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  const [popup] = await Promise.all([page.waitForEvent("popup"), host.click()]);
  expect(popup.url()).toBe(await host.getAttribute("href"));
  await expect(page.locator("[data-quick-view]")).not.toBeVisible();
  await expect(page).toHaveURL(/\/explore$/);
});

test("profile tabs: Saved and Hearted exist only for the owner", async ({ page }) => {
  const owner = await createUser("e2e-tabs", "Tab Owner", "user");
  sql(`
    UPDATE "user" SET handle = 'e2e-tabs' WHERE id = 'e2e-tabs';
    UPDATE tool SET submitted_by = 'e2e-tabs', credit_type = 'found' WHERE id = 'seed-toy-theater';
    INSERT OR IGNORE INTO bookmark (user_id, tool_id, created_at) VALUES ('e2e-tabs', 'seed-patatap', '2026-10-22T00:00:00.000Z');
  `);
  try {
    await page.context().clearCookies();
    await page.goto("/users/e2e-tabs");
    const tabs = page.getByRole("navigation", { name: "Profile sections" });
    await expect(tabs.getByRole("link")).toHaveText(["Made0", "Found1"]);
    await expect(page.getByRole("list", { name: "Stats" }).getByRole("listitem").first()).toHaveText("0 made");
    await expect(page.getByRole("list", { name: "Stats" })).toContainText("1 found");
    // Opens on the first public tab that has tools.
    await expect(tabs.locator("[aria-current=page]")).toHaveText("Found1");
    await expect(page.locator(".profile-tab .card h3")).toHaveText(["Toy Theater"]);
    expect((await page.goto("/users/e2e-tabs?tab=saved"))?.status()).toBe(200);
    await expect(page.locator(".profile-tab .card h3")).toHaveText(["Toy Theater"]);

    await page.context().addCookies([{ ...owner.cookie, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/users/e2e-tabs?tab=saved");
    await expect(tabs.getByRole("link")).toHaveText(["Made0", "Found1", "Saved1", "Hearted0"]);
    await expect(page.locator(".profile-tab")).toContainText("Only you can see this tab.");
    await expect(page.locator(".profile-tab .card h3")).toHaveText(["Patatap"]);
  } finally {
    sql(`
      UPDATE tool SET submitted_by = NULL, credit_type = 'editorial' WHERE id = 'seed-toy-theater';
      DELETE FROM "user" WHERE id = 'e2e-tabs';
    `);
  }
});

test("editors can describe a tag, with an audit row", async ({ page }) => {
  const mod = await createUser("e2e-tag-mod", "Tag Mod", "moderator");
  sql(`DELETE FROM tag_info WHERE tag = 'svg';`);
  try {
    await page.context().addCookies([{ ...mod.cookie, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/admin/tags");
    const text = "Generators and tools that give you a vector file you can drop straight into a design.";
    await page.getByLabel("Description for #svg").fill(text);
    await page.locator("#tag-svg").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved #svg");
    await page.goto("/tags/svg");
    await expect(page.locator(".tag-intro")).toHaveText(text);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", text);
    expect(sqlJson<{ n: number }>(`SELECT COUNT(*) AS n FROM moderation_event WHERE action = 'tag_description' AND actor_id = 'e2e-tag-mod'`)[0].n).toBeGreaterThan(0);

    await page.context().clearCookies();
    expect((await page.goto("/admin/tags"))?.url()).toMatch(/\/login\?next=/);
  } finally {
    sql(`DELETE FROM tag_info WHERE tag = 'svg'; DELETE FROM moderation_event WHERE actor_id = 'e2e-tag-mod'; DELETE FROM "user" WHERE id = 'e2e-tag-mod';`);
  }
});

test("Top today needs three tools with real activity, and yesterday's winner gets a badge", async ({ page }) => {
  const ids = ["seed-toy-theater", "seed-silk", "seed-wormhole", "seed-omatsuri"].map((id) => `'${id}'`).join(", ");
  const clear = `DELETE FROM tool_stat_daily WHERE tool_id IN (${ids}) AND day >= date('now', '-1 day');`;
  const inTop = (name: string) => page.locator(".top-today-list li", { hasText: name });
  sql(clear);
  try {
    // Below the threshold nothing is ranked, even with a view or two.
    sql(`INSERT INTO tool_stat_daily (tool_id, day, views, tries) VALUES ('seed-toy-theater', date('now'), 2, 0);`);
    await page.goto("/");
    await expect(inTop("Toy Theater")).toHaveCount(0);

    // Two qualifying tools are still not a top three (other tests may add some, so only check for these).
    sql(`
      UPDATE tool_stat_daily SET views = 4, tries = 4 WHERE tool_id = 'seed-toy-theater' AND day = date('now');
      INSERT INTO tool_stat_daily (tool_id, day, views, tries) VALUES ('seed-silk', date('now'), 4, 4);
      INSERT INTO tool_stat_daily (tool_id, day, views, tries) VALUES ('seed-omatsuri', date('now', '-1 day'), 10, 10);
    `);
    const others = sqlJson<{ n: number }>(
      // One line: the Windows shell drops a multi-line --command.
      `SELECT COUNT(*) AS n FROM (SELECT tool_id, SUM(p) AS score FROM (SELECT tool_id, views + 3 * tries AS p FROM tool_stat_daily WHERE day = date('now') ` +
        `UNION ALL SELECT tool_id, 5 FROM tool_like WHERE created_at >= date('now') UNION ALL SELECT tool_id, 5 FROM bookmark WHERE created_at >= date('now')) ` +
        `GROUP BY tool_id) WHERE score >= 12 AND tool_id NOT IN (${ids})`,
    )[0].n;
    if (others === 0) {
      await page.reload();
      await expect(page.locator(".top-today")).toHaveCount(0);
    }

    sql(`INSERT INTO tool_stat_daily (tool_id, day, views, tries) VALUES ('seed-wormhole', date('now'), 4, 4);`);
    await page.reload();
    await expect(inTop("Toy Theater")).toHaveCount(1);
    await expect(inTop("Silk")).toHaveCount(1);
    await page.goto("/tools/omatsuri");
    await expect(page.locator(".top-badge")).toContainText("Top tool of the day");
  } finally {
    sql(clear);
  }
});
