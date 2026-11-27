import { expect, test } from "@playwright/test";
import { createUser, sql, sqlJson } from "./helpers";

// Editors fixing a published listing from /admin/tools: text for admins, tags and category for moderators.
test.describe.configure({ mode: "serial" });

const TOOL = "seed-kleki";
let original: { tagline: string; tags: string; category: string; image_url: string | null; updated_at: string };

test.beforeAll(() => {
  original = sqlJson<typeof original>(`SELECT tagline, tags, category, image_url, updated_at FROM tool WHERE id = '${TOOL}'`)[0];
});

test.afterAll(() => {
  const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
  sql(`
    UPDATE tool SET tagline = ${q(original.tagline)}, tags = ${q(original.tags)}, category = ${q(original.category)},
      image_url = ${q(original.image_url)}, price = '', account = '', source_url = '', facts_checked_at = NULL,
      updated_at = ${q(original.updated_at)} WHERE id = '${TOOL}';
    DELETE FROM moderation_event WHERE tool_id = '${TOOL}' AND action = 'edit';
    DELETE FROM "user" WHERE id IN ('e2e-edit-admin', 'e2e-edit-mod');
  `);
});

const asUser = async (page: import("@playwright/test").Page, user: { cookie: { name: string; value: string; url: string } }) => {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...user.cookie, httpOnly: true, sameSite: "Lax" }]);
};

test("an admin edits the text and tags, and the change is logged", async ({ page }) => {
  await asUser(page, await createUser("e2e-edit-admin", "Ada Min", "admin"));
  await page.goto("/admin/tools");
  await page.locator(`tr[id="${TOOL}"]`).getByRole("link", { name: "Edit listing" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/tools/${TOOL}$`));

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toHaveText("Nothing changed.");

  await page.getByLabel("Description").fill("Paint and sketch in your browser, no install.");
  await page.getByLabel("Tags").fill("drawing, Painting, drawing");
  await page.getByLabel("Note for the history").fill("Plainer wording.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByLabel("Tags")).toHaveValue("drawing, painting");
  await expect(page.locator(".timeline li").first()).toContainText("Edited description, tags. Plainer wording.");

  await page.goto("/tools/kleki");
  await expect(page.getByText("Paint and sketch in your browser, no install.").first()).toBeVisible();
});

test("a stale form doesn't overwrite a newer change", async ({ page }) => {
  await asUser(page, await createUser("e2e-edit-admin", "Ada Min", "admin"));
  await page.goto(`/admin/tools/${TOOL}`);
  sql(`UPDATE tool SET updated_at = '2099-01-01T00:00:00.000Z' WHERE id = '${TOOL}'`);
  await page.getByLabel("Tags").fill("drawing");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("changed since you opened it");
  expect(sqlJson<{ tags: string }>(`SELECT tags FROM tool WHERE id = '${TOOL}'`)[0].tags).toBe('["drawing","painting"]');
});

test("a moderator can change tags and category but not the text", async ({ page }) => {
  await asUser(page, await createUser("e2e-edit-mod", "Mo Derator", "moderator"));
  await page.goto(`/admin/tools/${TOOL}`);
  await expect(page.getByLabel("Description")).toHaveAttribute("readonly", "");
  // A crafted request still can't change the text.
  await page.getByLabel("Description").evaluate((el) => {
    (el as HTMLInputElement).readOnly = false;
    (el as HTMLInputElement).value = "Moderator rewrite of the listing.";
  });
  await page.getByLabel("Category").selectOption("design");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const row = sqlJson<{ tagline: string; category: string }>(`SELECT tagline, category FROM tool WHERE id = '${TOOL}'`)[0];
  expect(row).toEqual({ tagline: "Paint and sketch in your browser, no install.", category: "design" });
});

test("checked facts show on the tool page and in its description", async ({ page }) => {
  await asUser(page, await createUser("e2e-edit-mod", "Mo Derator", "moderator"));
  await page.goto(`/admin/tools/${TOOL}`);
  await page.getByLabel("Source code").fill("https://example.com/owner/repo");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#sourceUrl-error")).toContainText("repository");

  await page.locator("select#price").selectOption("free");
  await page.locator("select#account").selectOption("none");
  await page.getByLabel("Source code").fill("https://github.com/owner/kleki");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.locator(".timeline li").first()).toContainText("Edited price, account, source code.");

  await page.goto("/tools/kleki");
  const facts = page.locator(".tool-facts");
  await expect(facts.locator("dd")).toContainText(["Free", "No account needed", "Open source on github.com"]);
  await expect(facts.getByRole("link", { name: "Open source on github.com" })).toHaveAttribute("href", "https://github.com/owner/kleki");
  await expect(facts.locator("p")).toContainText("Checked on kleki.com on");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Free, no account needed\. Try it:/);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join("")).toContain('"isAccessibleForFree":true');

  // Clearing every fact hides the section again.
  await page.goto(`/admin/tools/${TOOL}`);
  await page.locator("select#price").selectOption("");
  await page.locator("select#account").selectOption("");
  await page.getByLabel("Source code").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(sqlJson<{ facts_checked_at: string | null }>(`SELECT facts_checked_at FROM tool WHERE id = '${TOOL}'`)[0].facts_checked_at).toBeNull();
  await page.goto("/tools/kleki");
  await expect(page.locator(".tool-facts")).toHaveCount(0);
});

test("a cover URL that isn't an image is refused", async ({ page }) => {
  await asUser(page, await createUser("e2e-edit-admin", "Ada Min", "admin"));
  await page.goto(`/admin/tools/${TOOL}`);
  await page.getByLabel("Cover image URL").fill("http://example.com/cover.png");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#imageUrl-error")).toHaveText("Only https:// links are accepted.");
});
