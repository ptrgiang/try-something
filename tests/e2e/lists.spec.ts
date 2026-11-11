import { expect, test } from "@playwright/test";
import { createUser, sql, sqlJson } from "./helpers";

test.afterAll(() => {
  sql(`DELETE FROM report WHERE target_type = 'list' AND reporter_id IN ('e2e-list-other', 'e2e-list-mod');
    DELETE FROM "user" WHERE id IN ('e2e-list-owner', 'e2e-list-other', 'e2e-list-mod');`);
});

test("make a list from a tool page, make it public, and share it from the profile", async ({ page }) => {
  const owner = await createUser("e2e-list-owner", "Lis Ter", "user");
  sql(`UPDATE "user" SET handle = 'lis-ter' WHERE id = 'e2e-list-owner';`);

  // Signed out, Add to list asks to sign in.
  await page.goto("/tools/haikei");
  await expect(page.locator(".detail").getByRole("link", { name: "Add to list" })).toHaveAttribute("href", /^\/login\?next=/);

  await page.context().addCookies([{ ...owner.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/tools/haikei");
  const toggle = page.locator(".detail [data-list-toggle]");
  await toggle.click();
  const pop = page.getByRole("group", { name: "Add Haikei to a list" });
  await expect(pop).toContainText("No lists yet.");
  await pop.getByLabel("New list name").fill("Design kit");
  await pop.getByRole("button", { name: "Create" }).click();
  await expect(pop.getByRole("checkbox", { name: /Design kit/ })).toBeChecked();
  await expect(toggle).toHaveText("In 1 list");

  // Fontjoy and Patatap join too.
  for (const slug of ["fontjoy", "patatap"]) {
    await page.goto(`/tools/${slug}`);
    await page.locator(".detail [data-list-toggle]").click();
    await page.getByRole("checkbox", { name: /Design kit/ }).check();
    await expect(page.locator(".detail [data-list-toggle]")).toHaveText("In 1 list");
  }
  // Unchecking takes it out again.
  await page.getByRole("checkbox", { name: /Design kit/ }).uncheck();
  await expect(page.locator(".detail [data-list-toggle]")).toHaveText("Add to list");
  await page.getByRole("checkbox", { name: /Design kit/ }).check();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-list-pop]")).toBeHidden();

  const [{ id, slug }] = sqlJson<{ id: string; slug: string }>(`SELECT id, slug FROM user_list WHERE user_id = 'e2e-list-owner'`);
  expect(slug).toBe("design-kit");

  // Private until made public: nobody else can open it.
  const other = await createUser("e2e-list-other", "Oth Er", "user");
  expect((await page.request.get(`/users/lis-ter/lists/${slug}`, { headers: { cookie: `${other.cookie.name}=${other.cookie.value}` } })).status()).toBe(404);
  expect((await page.request.get(`/me/lists/${id}`, { headers: { cookie: `${other.cookie.name}=${other.cookie.value}` } })).status()).toBe(404);

  await page.goto("/me/lists");
  await page.getByRole("link", { name: /Design kit/ }).click();
  await page.getByLabel("Description (optional)").fill("Fonts, sounds and backgrounds.");
  await page.getByLabel(/^Public/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.getByRole("button", { name: "Remove Patatap" }).click();
  await expect(page.getByRole("heading", { name: "2 tools" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/users/lis-ter?tab=lists");
  await page.getByRole("link", { name: /Design kit/ }).click();
  await expect(page).toHaveURL(/\/users\/lis-ter\/lists\/design-kit$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Design kit");
  await expect(page.locator(".grid .card h2")).toHaveCount(2);
  // Thin lists stay out of search; from three tools on, search engines may index them.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  sql(`INSERT INTO user_list_item (list_id, tool_id, created_at) SELECT '${id}', id, '${new Date().toISOString()}' FROM tool WHERE slug = 'patatap';`);
  await page.reload();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/users\/lis-ter\/lists\/design-kit$/);

  // Someone else reports it; a moderator hides it from the Reports queue.
  await page.context().addCookies([{ ...other.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.reload();
  await page.getByRole("button", { name: "Report this list" }).click();
  const dialog = page.getByRole("dialog", { name: "Report this list" });
  await dialog.getByLabel("Spam or advertising").check();
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByRole("heading", { name: "Thanks, we'll take a look" })).toBeVisible();

  const mod = await createUser("e2e-list-mod", "Mod List", "moderator");
  await page.context().clearCookies();
  await page.context().addCookies([{ ...mod.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/admin/reports");
  const card = page.locator(".report-card", { hasText: "Design kit" });
  await expect(card).toContainText("by @lis-ter");
  await card.getByRole("button", { name: "Hide list" }).click();
  await expect(page.getByRole("alert")).toContainText("Add a reason");
  await page.locator(".report-card", { hasText: "Design kit" }).getByPlaceholder(/Reason/).fill("Spam links in the description");
  await page.locator(".report-card", { hasText: "Design kit" }).getByRole("button", { name: "Hide list" }).click();
  await expect(page.locator(".report-card", { hasText: "Design kit" })).toHaveCount(0);

  // Gone for everyone else, still there for moderators (marked) and for its owner.
  expect((await page.request.get(`/users/lis-ter/lists/${slug}`, { headers: { cookie: `${other.cookie.name}=${other.cookie.value}` } })).status()).toBe(404);
  await page.goto(`/users/lis-ter/lists/${slug}`);
  await expect(page.getByRole("note")).toContainText("Spam links in the description");
  await page.context().clearCookies();
  await page.goto("/users/lis-ter?tab=lists");
  await expect(page.getByRole("link", { name: /Design kit/ })).toHaveCount(0);
  await page.context().addCookies([{ ...owner.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`/me/lists/${id}`);
  await expect(page.getByRole("note")).toContainText("A moderator hid this list");
  await expect(page.getByRole("note")).toContainText("Spam links in the description");

  // A moderator puts it back from the Lists screen.
  await page.context().clearCookies();
  await page.context().addCookies([{ ...mod.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/admin/lists?status=hidden");
  await page.locator("tr", { hasText: "Design kit" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("No hidden lists.")).toBeVisible();
  await page.goto("/admin/lists?q=lis-ter");
  await expect(page.locator("tr", { hasText: "Design kit" })).toContainText("public");
  expect((await page.request.get(`/users/lis-ter/lists/${slug}`, { headers: { cookie: `${other.cookie.name}=${other.cookie.value}` } })).status()).toBe(200);
  const audit = sqlJson<{ action: string }>(`SELECT action FROM moderation_event WHERE list_id = '${id}' ORDER BY created_at`);
  expect(audit.map((a) => a.action).sort()).toEqual(["hide_list", "resolve_reports", "restore_list"]);
});
