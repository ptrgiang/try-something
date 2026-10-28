import { expect, test, type Page } from "@playwright/test";
import { createUser, sql, sqlJson } from "./helpers";

// Stickers paint on canvas once the kit has loaded; an unpainted canvas keeps the default 300px backing width.
async function painted(page: Page, name: string) {
  const canvas = page.locator(`canvas[data-sticker="${name}"]`).first();
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width === Math.round(c.clientWidth * Math.min(3, devicePixelRatio)))).toBe(true);
  if (process.env.SHOTS) await page.screenshot({ path: `.shots/sticker-${name}.png` });
}

test("Discover, search, 404 and feedback show their stickers", async ({ page }) => {
  await page.goto("/discover");
  await painted(page, "compass");
  await expect(page.locator(".mood-chips canvas[data-sticker]")).toHaveCount(5);
  await painted(page, "briefcase");

  await page.goto("/explore?q=zzzz-no-such-tool");
  await painted(page, "search");
  await expect(page.locator(".sticker-empty .popular-tags a").first()).toHaveAttribute("href", /^\/tags\//);

  // The palette builds its sticker only once a search comes up empty.
  await page.goto("/about");
  await page.keyboard.press("Control+k");
  await expect(page.locator(".palette canvas")).toHaveCount(0);
  await page.locator("#palette-q").fill("zzzz-no-such-tool");
  const empty = page.locator("[data-palette-empty]");
  await expect(empty).toBeVisible();
  await expect(empty.locator(".popular-tags a").first()).toHaveAttribute("href", /^\/tags\//);
  await painted(page, "search");
  await page.locator("#palette-q").fill("a");
  await expect(empty).toBeHidden();
  await page.keyboard.press("Escape");

  await page.goto("/no-such-page");
  await painted(page, "plane");

  await page.goto("/feedback?sent");
  await painted(page, "chat");
});

test("the first Save shows a toast once; a heart bursts over the button", async ({ page }) => {
  await page.goto("/explore");
  await page.locator(".grid [data-save]").first().click();
  const toast = page.locator(".sticker-toast");
  await expect(toast).toContainText("Saved on this browser");
  await expect(toast.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=/me/saved");
  await painted(page, "bookmark");
  await toast.getByRole("button", { name: "Dismiss" }).click();
  await page.locator(".grid [data-save]").nth(1).click();
  await page.waitForTimeout(500);
  await expect(toast).toHaveCount(0);

  const fan = await createUser("e2e-sticker", "Sticker Fan", "user");
  sql(`DELETE FROM tool_like WHERE user_id = 'e2e-sticker'; DELETE FROM bookmark WHERE user_id = 'e2e-sticker'; DELETE FROM notification WHERE user_id = 'e2e-sticker';`);
  // The anonymous saves above would merge into the account on its first page load.
  await page.evaluate(() => localStorage.removeItem("ts:saved"));
  await page.context().addCookies([{ ...fan.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/explore");
  await page.locator(".grid [data-like]").first().click();
  await expect(page.locator("canvas.sticker-burst[data-sticker=heart]")).toHaveCount(1);
  await expect(page.locator("canvas.sticker-burst")).toHaveCount(0, { timeout: 5000 });

  await page.goto("/me/notifications");
  await painted(page, "bell");
  await page.goto("/me/saved");
  await painted(page, "bookmark-face");
  sql(`DELETE FROM tool_like WHERE user_id = 'e2e-sticker'; DELETE FROM bookmark WHERE user_id = 'e2e-sticker';`);
});

test("a tool the user made that just went live gets a banner with a badge and Share", async ({ page }) => {
  const maker = await createUser("e2e-sticker-maker", "Sticker Maker", "user");
  const [tool] = sqlJson<{ id: string; slug: string; by: string | null; credit: string }>(
    "SELECT id, slug, submitted_by AS by, credit_type AS credit FROM tool WHERE status = 'published' ORDER BY slug LIMIT 1",
  );
  const now = new Date().toISOString();
  sql(`DELETE FROM submission WHERE id = 'e2e-sticker-sub';
    INSERT INTO submission (id, user_id, origin, url, canonical_key, name, tagline, try_this, category, status, tool_id, created_at, updated_at)
      VALUES ('e2e-sticker-sub', 'e2e-sticker-maker', 'made', 'https://example.com/sticker', 'example.com/sticker', 'Sticker Tool', 'A tagline.', 'Try it.', 'play', 'published', '${tool.id}', '${now}', '${now}');
    UPDATE tool SET submitted_by = 'e2e-sticker-maker', credit_type = 'made' WHERE id = '${tool.id}';`);
  try {
    await page.context().addCookies([{ ...maker.cookie, httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/me/submissions");
    const banner = page.locator(".celebrate");
    await expect(banner).toContainText("Sticker Tool is live!");
    await expect(banner.getByRole("link", { name: "Get a badge" })).toHaveAttribute("href", `/me/share/${tool.slug}`);
    await expect(banner.getByRole("button", { name: "Share" })).toBeVisible();
    await painted(page, "gift");
    if (process.env.SHOTS) {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.screenshot({ path: ".shots/sticker-banner-375.png" });
    }
  } finally {
    sql(`DELETE FROM submission WHERE id = 'e2e-sticker-sub';
      UPDATE tool SET submitted_by = ${tool.by ? `'${tool.by}'` : "NULL"}, credit_type = '${tool.credit}' WHERE id = '${tool.id}';`);
  }
});
