import { expect, test } from "@playwright/test";
import { createUser, sql, sqlJson } from "./helpers";

// Makers' product updates through moderation, and the default Picks order they can affect.
test.describe.configure({ mode: "serial" });

const TOOL = "seed-kleki";
const NOTE = "Now has a layers panel and exports to PSD.";
let original: { tagline: string; try_this: string; why: string };
let maker: Awaited<ReturnType<typeof createUser>>;

test.beforeAll(async () => {
  maker = await createUser("e2e-upd-maker", "Mae Ker", "user");
  original = sqlJson<typeof original>(`SELECT tagline, try_this, why FROM tool WHERE id = '${TOOL}'`)[0];
  sql(`
    DELETE FROM tool_update WHERE tool_id = '${TOOL}';
    DELETE FROM moderation_event WHERE tool_id = '${TOOL}' AND action LIKE 'update_%';
    UPDATE tool SET submitted_by = 'e2e-upd-maker', credit_type = 'made', refreshed_at = NULL WHERE id = '${TOOL}';
  `);
});

test.afterAll(() => {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  sql(`
    DELETE FROM tool_update WHERE tool_id = '${TOOL}';
    UPDATE tool SET submitted_by = NULL, credit_type = 'editorial', refreshed_at = NULL,
      tagline = ${q(original.tagline)}, try_this = ${q(original.try_this)}, why = ${q(original.why)} WHERE id = '${TOOL}';
    DELETE FROM "user" WHERE id IN ('e2e-upd-maker', 'e2e-upd-other', 'e2e-upd-mod');
  `);
});

const asUser = async (page: import("@playwright/test").Page, user: { cookie: { name: string; value: string; url: string } }) => {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...user.cookie, httpOnly: true, sameSite: "Lax" }]);
};

test("only the maker can post an update, one at a time", async ({ page }) => {
  const other = await createUser("e2e-upd-other", "Otto Ther", "user");
  await asUser(page, other);
  expect((await page.goto("/me/tools/kleki/update"))!.status()).toBe(404);

  await asUser(page, maker);
  await page.goto("/me/submissions");
  await page.getByRole("region", { name: "Your listed tools" }).getByRole("link", { name: "Post an update" }).click();
  await expect(page.getByLabel("Description")).toHaveValue(original.tagline);

  await page.getByLabel("What changed").fill("new");
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Say what changed (10+ characters).")).toBeVisible();

  await page.getByLabel("What changed").fill(NOTE);
  await page.getByLabel("Description").fill("Paint, sketch and now layer in the browser.");
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page).toHaveURL(/\/me\/submissions\?update=sent/);
  await expect(page.getByRole("row", { name: /Kleki/ })).toContainText("Update waiting for review");

  await page.goto("/me/tools/kleki/update");
  await expect(page.getByText("Waiting for review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send for review" })).toHaveCount(0);
  // Nothing is public until a moderator approves.
  await page.goto("/tools/kleki");
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test("a moderator approves and resurfaces it; Picks moves it up, New doesn't", async ({ page }) => {
  const mod = await createUser("e2e-upd-mod", "Mo Derator", "moderator");
  await asUser(page, mod);
  await page.goto("/admin/updates");
  const panel = page.locator(".update-review", { hasText: "Kleki" });
  await expect(panel.locator("ins")).toHaveText("Paint, sketch and now layer in the browser.");

  await panel.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("alert")).toHaveText("Add a note for the maker before declining.");

  await page.locator(".update-review", { hasText: "Kleki" }).getByLabel("Resurface in Picks").check();
  await page.locator(".update-review", { hasText: "Kleki" }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("No updates waiting.")).toBeVisible();

  await page.goto("/tools/kleki");
  await expect(page.locator(".tool-updates")).toContainText(NOTE);
  await expect(page.locator(".detail")).toContainText("Paint, sketch and now layer in the browser.");
  const audit = sqlJson<{ n: number }>(`SELECT COUNT(*) AS n FROM moderation_event WHERE tool_id = '${TOOL}' AND action = 'update_approve'`)[0];
  expect(audit.n).toBe(1);

  const featured = sqlJson<{ id: string }>(`SELECT id FROM tool WHERE status = 'published' AND featured > 0 ORDER BY featured`).map((r) => r.id);
  const cards = () => page.locator(".grid .card").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.impression));
  await page.goto("/explore");
  await expect(page.locator(".sort-summary")).toContainText("Picks");
  expect((await cards()).slice(0, featured.length + 1)).toEqual([...featured, TOOL]);

  await page.goto("/explore?sort=new");
  expect((await cards())[0]).not.toBe(TOOL);
});
