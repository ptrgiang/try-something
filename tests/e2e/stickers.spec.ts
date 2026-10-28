import { expect, test, type Page } from "@playwright/test";
import { createUser, sql } from "./helpers";

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
  await painted(page, "toggle");

  await page.goto("/explore?q=zzzz-no-such-tool");
  await painted(page, "search");

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
