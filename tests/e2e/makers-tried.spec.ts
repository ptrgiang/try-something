import { expect, test } from "@playwright/test";

test("the makers page explains listing and leads to Submit", async ({ page }) => {
  const res = await page.goto("/makers");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Made something people can try?");
  await expect(page.getByRole("heading", { name: "What you get" })).toBeVisible();
  await page.getByText("Does it cost anything?").click();
  await expect(page.getByText("Listings are never sold")).toBeVisible();
  await page.locator(".makers-head").getByRole("link", { name: "Submit your tool" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fsubmit|\/login\?next=\/submit/);

  // Signed out, /submit says what you get before asking to sign in, and the header always offers Submit.
  await page.goto("/submit");
  await expect(page.locator(".submit-gate")).toContainText("Makers get their own numbers");
  await expect(page.locator(".site-header .header-submit")).toHaveAttribute("href", "/submit");
});

test("Try it marks the tool as tried on this device, and /tried lists it", async ({ page, context }) => {
  await page.goto("/tools/haikei");
  await expect(page.locator(".tried-note")).toHaveCount(0);
  const [tab] = await Promise.all([context.waitForEvent("page"), page.locator(".detail .hero-ctas a[data-try]").click()]);
  await tab.close();
  await expect(page.locator(".tried-note")).toContainText("You opened this on");

  await page.goto("/tags/svg");
  const card = page.locator(".card", { has: page.getByRole("link", { name: "Haikei", exact: true }) });
  await expect(card.locator(".tried-chip")).toHaveText("Tried");

  await page.goto("/tried");
  await expect(page.locator("[data-tried-list] .card h2")).toHaveText(["Haikei"]);
  await page.getByRole("button", { name: "Clear this list" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Clear list" }).click();
  await expect(page.locator("[data-tried-empty]")).toBeVisible();
});

test("Discover sends the tools tried on this device as skip and keeps it for the round", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("ts:tried", JSON.stringify([{ id: "x", slug: "haikei", at: Date.now() }])));
  await page.goto("/discover");
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/discover?mood=play")),
    page.locator('a[data-deal="mood"]', { hasText: "Play something" }).click(),
  ]);
  expect(new URL(req.url()).searchParams.get("skip")).toBe("haikei");
  await expect(page.locator('[data-deal="next"]')).toHaveAttribute("href", /skip=haikei/);
});
