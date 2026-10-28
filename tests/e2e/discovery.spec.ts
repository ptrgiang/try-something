import { expect, test } from "@playwright/test";
import { sqlJson } from "./helpers";

test("tag pages list tagged tools with related tags, and tool tags link to them", async ({ page }) => {
  const res = await page.goto("/tags/svg");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("#svg");
  const names = await page.locator(".grid .card h2").allTextContents();
  expect(names).toEqual(expect.arrayContaining(["Haikei", "fffuel"]));
  await expect(page.getByRole("navigation", { name: "Related tags" })).toContainText("#backgrounds");

  expect((await page.goto("/tags/SVG"))?.url()).toMatch(/\/tags\/svg$/);
  expect((await page.goto("/tags/no-such-tag-here"))?.status()).toBe(404);

  await page.goto("/tools/haikei");
  await page.locator(".detail .tags a", { hasText: "#svg" }).click();
  await expect(page).toHaveURL(/\/tags\/svg$/);
});

test("Popular has a timeframe and the tool page suggests similar tools", async ({ page }) => {
  await page.goto("/explore?sort=popular");
  // Sort and timeframe live in one menu next to the categories.
  const menu = page.locator("[data-sort-menu]");
  await expect(menu.locator("summary")).toHaveText("Sort: Popular");
  await menu.locator("summary").click();
  const timeframe = page.getByRole("navigation", { name: "Timeframe" });
  await expect(timeframe.locator("[aria-current=true]")).toHaveText("All time");
  await timeframe.getByRole("link", { name: "Past month" }).click();
  await expect(page).toHaveURL(/sort=popular&period=month/);
  await expect(menu.locator("summary")).toHaveText("Sort: Popular · Past month");
  await menu.locator("summary").click();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open");
  await menu.locator("summary").click();
  await page.getByRole("navigation", { name: "Sort" }).getByRole("link", { name: "New" }).click();
  await expect(page.getByRole("navigation", { name: "Timeframe" })).toHaveCount(0);

  await page.goto("/tools/haikei");
  const similar = page.locator("[data-related=similar] .card h3");
  await expect(similar).toHaveCount(4);
  // fffuel (svg), PatternPad and Fontjoy (generative) each share a tag and the category, so they tie for the top.
  for (const name of (await similar.allTextContents()).slice(0, 3)) expect(["Fontjoy", "PatternPad", "fffuel"]).toContain(name);
});

test("quick view steps through the list with the arrow keys and Back still returns to it", async ({ page }) => {
  await page.goto("/explore");
  const paths = await page.locator(".grid .card h2 a").evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  await page.locator(".grid .card h2 a").first().click();
  const dialog = page.locator("[data-quick-view]");
  await expect(dialog.locator(".detail .page-title")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${paths[0]}$`));
  await expect(dialog.locator("[data-quick-step='-1']")).toBeHidden();

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`${paths[1]}$`));
  await expect(dialog.locator(".detail .page-title")).toBeVisible();
  await dialog.locator("[data-quick-step='1']").click();
  await expect(page).toHaveURL(new RegExp(`${paths[2]}$`));
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(new RegExp(`${paths[1]}$`));

  await page.goBack();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(dialog).not.toBeVisible();
});

test("the home sort menu swaps the list in place and closes", async ({ page }) => {
  await page.goto("/");
  const menu = page.locator("[data-home-list] [data-sort-menu]");
  await menu.locator("summary").click();
  await menu.getByRole("link", { name: "Trending" }).click();
  await expect(page).toHaveURL(/\/\?sort=trending#tools$/);
  await expect(menu.locator("summary")).toHaveText("Sort: Trending");
  await expect(menu).not.toHaveAttribute("open");
});

test("the home page ends with category tiles that show real counts", async ({ page }) => {
  await page.goto("/");
  const browse = page.getByRole("region", { name: "Browse by category" });
  const design = browse.getByRole("link", { name: /^Design \d+ tools?$/ });
  await expect(design).toHaveAttribute("href", "/explore/design");
  const shown = Number((await design.textContent())!.match(/(\d+) tools?/)![1]);
  await design.click();
  await expect(page.locator(".result-count")).toHaveText(`${shown} ${shown === 1 ? "tool" : "tools"}`);
});

test("header menus close on an outside click or Escape, and GitHub opens in a new tab", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const menu = page.locator("details.mobile-menu");
  await menu.locator("summary").click();
  await expect(menu).toHaveAttribute("open");
  await page.mouse.click(10, 600);
  await expect(menu).not.toHaveAttribute("open");
  await menu.locator("summary").click();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open");

  for (const link of await page.locator('a[href^="https://github.com/"]').all()) {
    await expect(link).toHaveAttribute("target", "_blank");
  }
});

test("the RSS feed lists the newest tools, and the header has Surprise me", async ({ page, request }) => {
  const res = await request.get("/feed.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/rss+xml");
  const xml = await res.text();
  expect(xml).toMatch(/<item><title>[^<]+<\/title><link>https:\/\/trysometh\.ing\/tools\//);

  await page.goto("/");
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute("href", "/feed.xml");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Surprise me" })).toHaveAttribute("href", "/surprise");
});

test("a discovery session shows three different tools for the mood, then offers three more", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Discover by mood" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await page.getByRole("link", { name: /Play something/ }).click();
  const shown = new Set<string>();
  for (let step = 1; step <= 3; step++) {
    await expect(page.locator(".discover-progress")).toContainText(`Discovery ${step} of 3`);
    const id = await page.locator(".discover-card").getAttribute("data-impression");
    expect(shown.has(id!)).toBe(false);
    shown.add(id!);
    const [{ category }] = sqlJson<{ category: string }>(`SELECT category FROM tool WHERE id = '${id}'`);
    expect(["play", "fun"]).toContain(category);
    await expect(page.locator(".discover-card").getByRole("link", { name: /^Try it on/ })).toHaveAttribute("href", /utm_source=trysometh\.ing/);
    if (step < 3) await page.getByRole("link", { name: "Next discovery" }).click();
  }
  await page.getByRole("link", { name: "3 more" }).click();
  await expect(page.locator(".discover-progress")).toContainText("Discovery 1 of 3");
  expect(shown.has((await page.locator(".discover-card").getAttribute("data-impression"))!)).toBe(false);
});
