import { expect, test, type Page } from "@playwright/test";
import { cleanup, createUser, sql, sqlJson, type TestUser } from "./helpers";

// M1 community: profiles, comments, reports and moderation, roles, collections, account deletion.
let ada: TestUser;
let ben: TestUser;
let cy: TestUser;
let dee: TestUser;
let mod: TestUser;
let admin: TestUser;
const TOOL = "excalidraw";

function cleanCommunity() {
  sql(`
    DELETE FROM report WHERE reporter_id LIKE 'e2e-c-%' OR target_id IN (SELECT id FROM comment WHERE user_id LIKE 'e2e-c-%');
    DELETE FROM comment WHERE user_id LIKE 'e2e-c-%' OR body LIKE 'E2E %';
    DELETE FROM collection WHERE slug LIKE 'e2e-%';
    UPDATE tool SET submitted_by = NULL, credit_type = 'editorial', maker_verified_at = NULL WHERE submitted_by LIKE 'e2e-c-%';
  `);
}

test.beforeAll(async () => {
  cleanup();
  cleanCommunity();
  ada = await createUser("e2e-c-ada", "Ada Lovelace", "user");
  ben = await createUser("e2e-c-ben", "Ben Reporter", "user");
  cy = await createUser("e2e-c-cy", "Cy Reporter", "user");
  dee = await createUser("e2e-c-dee", "Dee Reporter", "user");
  mod = await createUser("e2e-c-mod", "Mia Moderator", "moderator");
  admin = await createUser("e2e-c-admin", "Al Admin", "admin");
});

test.afterAll(() => {
  cleanCommunity();
  sql(`DELETE FROM "user" WHERE id LIKE 'e2e-c-%';`);
  cleanup();
});

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, user: TestUser) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...user.cookie, httpOnly: true, sameSite: "Lax" }]);
}

async function postComment(page: Page, text: string) {
  await page.locator("[data-comment-form] textarea").fill(text);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.locator(".comment-body", { hasText: text })).toBeVisible();
}

test("a profile goes public only once a handle is picked", async ({ page }) => {
  await signIn(page, ada);
  await page.goto("/me/settings");
  await expect(page.getByText("Pick a handle to get a public profile page.")).toBeVisible();
  await page.getByLabel("Handle").fill("admin");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("That handle is reserved.")).toBeVisible();

  await page.getByLabel("Handle").fill("Ada-E2E");
  await page.getByLabel("Short bio").fill("Makes small <b>things</b> for the web.");
  await page.getByLabel("Website").fill("https://example.com/ada");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  // Credit on a tool page links to the profile.
  sql(`UPDATE tool SET submitted_by = 'e2e-c-ada', credit_type = 'found' WHERE slug = '${TOOL}';`);
  await page.goto(`/tools/${TOOL}`);
  await page.getByRole("link", { name: "Ada Lovelace" }).first().click();
  await expect(page).toHaveURL(/\/users\/ada-e2e$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeVisible();
  await expect(page.getByText("Makes small <b>things</b> for the web.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Found by Ada Lovelace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "example.com" })).toHaveAttribute("rel", /nofollow/);

  await page.context().clearCookies();
  await page.goto("/users/nobody-here-e2e");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing to try here.");
});

test("comments: sign-in gate, post, reply, edit, delete", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`/tools/${TOOL}`);
  await expect(page.getByRole("link", { name: "Sign in to comment" })).toBeVisible();

  await signIn(page, ada);
  await page.goto(`/tools/${TOOL}`);
  await postComment(page, "E2E first <script>window.__xss=1</script> try: draw a cat");
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator(".comments-count")).toHaveText("1");
  await expect(page.locator(".comment").first().locator(".comment-badge")).toHaveText("Found it");

  await signIn(page, ben);
  await page.goto(`/tools/${TOOL}`);
  await page.locator(".comment").first().getByRole("button", { name: "Reply" }).click();
  await page.getByRole("textbox", { name: "Reply to Ada Lovelace" }).fill("E2E reply from Ben");
  await page.getByRole("button", { name: "Reply", exact: true }).last().click();
  await expect(page.locator(".comment-replies .comment-body")).toHaveText("E2E reply from Ben");

  const reply = page.locator(".comment-replies .comment");
  await reply.getByRole("button", { name: "Edit" }).click();
  await reply.locator("textarea").fill("E2E reply from Ben, edited");
  await reply.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".comment-replies .comment-body")).toHaveText("E2E reply from Ben, edited");
  await expect(page.locator(".comment-replies .comment-edited")).toBeVisible();

  // Ben can't edit Ada's comment through the API either.
  const adaId = await page.locator(".comment").first().getAttribute("data-comment");
  const res = await page.request.patch("/api/comments", { headers: { origin: new URL(page.url()).origin }, data: { id: adaId, body: "hijack" } });
  expect(res.status()).toBe(403);

  // Ada listed the tool and wrote the parent: one reply notice, not a second "new comment" one.
  await signIn(page, ada);
  await page.goto("/me/notifications");
  await expect(page.locator(".notif")).toHaveCount(1);
  await expect(page.locator(".notif")).toContainText("Ben Reporter replied to your comment on Excalidraw");
  await expect(page.locator(".notif")).toContainText("E2E reply from Ben, edited");

  await signIn(page, ben);
  await page.goto(`/tools/${TOOL}`);
  await page.locator(".comment-replies .comment").getByRole("button", { name: "Delete" }).click();
  await page.locator("[data-confirm-dialog]").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".comment-replies")).toHaveCount(0);
  await expect(page.locator(".comments-count")).toHaveText("1");

  // A deleted comment drops out of the notifications too.
  await signIn(page, ada);
  await page.goto("/me/notifications");
  await expect(page.getByRole("heading", { name: "Nothing new yet" })).toBeVisible();
});

test("three reports hide a comment until a moderator decides", async ({ page }) => {
  for (const user of [ben, cy, dee]) {
    await signIn(page, user);
    await page.goto(`/tools/${TOOL}`);
    await page.locator(".comment").first().getByRole("button", { name: "Report" }).click();
    await page.getByLabel("Spam or advertising").check();
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("heading", { name: "Thanks, we'll take a look" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
  }
  await page.reload();
  await expect(page.locator(".comment")).toHaveCount(0);
  await expect(page.locator(".comments-count")).toHaveText("0");

  await signIn(page, mod);
  await page.goto("/admin/reports");
  const card = page.locator(".report-card").first();
  await expect(card).toContainText("E2E first");
  await expect(card.locator(".report-reasons-list li")).toHaveCount(3);
  await card.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByText("No open reports.")).toBeVisible();
  await page.goto(`/tools/${TOOL}`);
  await expect(page.locator(".comment-body").first()).toContainText("E2E first");

  // Hide it for real from the comments screen; the audit row records the reason.
  await page.goto("/admin/comments");
  const row = page.locator("tr", { hasText: "E2E first" });
  await row.getByRole("textbox", { name: "Reason for hiding" }).fill("Off-topic test");
  await row.getByRole("button", { name: "Hide" }).click();
  await page.goto(`/tools/${TOOL}`);
  await expect(page.locator(".comment")).toHaveCount(0);
  const audit = sqlJson<{ action: string }>(`SELECT action FROM moderation_event WHERE comment_id IN (SELECT id FROM comment WHERE user_id = 'e2e-c-ada') ORDER BY created_at`);
  expect(audit.map((a) => a.action)).toEqual(["auto_hide", "restore", "hide"]);
});

test("only admins change roles, never their own", async ({ page }) => {
  await signIn(page, mod);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This area is for moderators.");

  await signIn(page, admin);
  await page.goto("/admin/users?q=e2e-c-ben");
  const row = page.locator("tr", { hasText: "Ben Reporter" });
  await row.getByRole("combobox").selectOption("moderator");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("tr", { hasText: "Ben Reporter" }).locator(".status")).toHaveText("moderator");
  await page.goto("/admin/users?q=e2e-c-admin");
  await expect(page.locator("tr", { hasText: "Al Admin" })).toContainText("That's you");

  // A forged POST for your own role is refused server-side.
  const res = await page.request.post("/admin/users", {
    headers: { origin: new URL(page.url()).origin },
    form: { userId: "e2e-c-admin", role: "user" },
  });
  expect(res.status()).toBe(400);
  expect(sqlJson<{ role: string }>(`SELECT role FROM "user" WHERE id = 'e2e-c-admin'`)[0].role).toBe("admin");
});

test("editors build and publish a collection", async ({ page }) => {
  await signIn(page, mod);
  await page.goto("/admin/collections");
  await page.getByLabel("New collection title").fill("E2E weekend toys");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByLabel("Tool page URL or slug").fill(`https://trysometh.ing/tools/${TOOL}`);
  await page.getByRole("button", { name: "Add tool" }).click();
  await expect(page.locator(".collection-edit-list li")).toHaveCount(1);
  await page.getByLabel("Page address").fill("e2e-weekend-toys");
  await page.getByLabel("Published").check();
  await page.getByRole("button", { name: "Save collection" }).click();
  await page.context().clearCookies();
  await page.goto("/collections/e2e-weekend-toys");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E weekend toys");
  await expect(page.locator(".card")).toHaveCount(1);
});

test("deleting an account signs out and blanks comments", async ({ page }) => {
  await signIn(page, cy);
  await page.goto(`/tools/${TOOL}`);
  await postComment(page, "E2E comment from Cy");
  await page.goto("/me/settings/account");
  await page.getByLabel("Type delete to confirm").fill("yes");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Type delete to confirm.")).toBeVisible();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
  expect(sqlJson(`SELECT 1 FROM "user" WHERE id = 'e2e-c-cy'`)).toHaveLength(0);
  expect(sqlJson(`SELECT 1 FROM comment WHERE body = 'E2E comment from Cy'`)).toHaveLength(0);
  await page.goto("/me/saved");
  await expect(page).toHaveURL(/\/login/);
});

test("maker verification is offered only to the maker and shows a badge once proven", async ({ page }) => {
  sql(`UPDATE tool SET submitted_by = 'e2e-c-ada', credit_type = 'made', maker_verified_at = NULL WHERE slug = '${TOOL}';`);
  await signIn(page, ben);
  await page.goto(`/me/verify/${TOOL}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing to try here.");

  await signIn(page, ada);
  await page.goto(`/me/verify/${TOOL}`);
  await expect(page.locator("[data-copy-src]").last()).toHaveText(/^ts-[0-9a-f]{32}$/);
  await page.goto(`/tools/${TOOL}`);
  await expect(page.getByText("not verified")).toBeVisible();

  // The proof fetch needs a public site, so the success path is unit-tested; here we only check the badge.
  sql(`UPDATE tool SET maker_verified_at = '2026-10-22T00:00:00Z' WHERE slug = '${TOOL}';`);
  await page.reload();
  await expect(page.locator(".credits .verified-chip")).toHaveText("Verified maker");
  sql(`UPDATE tool SET maker_verified_at = NULL WHERE slug = '${TOOL}';`);
});

test("makers get a badge page, and the badge image only shows verified once proven", async ({ page, request }) => {
  sql(`UPDATE tool SET submitted_by = 'e2e-c-ada', credit_type = 'made', maker_verified_at = NULL WHERE slug = '${TOOL}';`);
  await signIn(page, ben);
  await page.goto(`/me/share/${TOOL}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing to try here.");

  await signIn(page, ada);
  await page.goto(`/me/share/${TOOL}`);
  await expect(page.getByRole("navigation", { name: "Badge style" })).toHaveCount(0);
  await expect(page.locator("[data-copy-src]").first()).toContainText(`/tools/${TOOL}?utm_source=badge`);
  await page.getByRole("link", { name: "Dark site" }).click();
  await expect(page.locator(".badge-preview img")).toHaveAttribute("src", `/badge/${TOOL}.svg?style=pill&theme=dark`);

  const unverified = await request.get(`/badge/${TOOL}.svg?style=verified`);
  expect(unverified.headers()["content-type"]).toContain("image/svg+xml");
  expect(await unverified.text()).toContain("Listed on Try Something");

  sql(`UPDATE tool SET maker_verified_at = '2026-10-22T00:00:00Z' WHERE slug = '${TOOL}';`);
  expect(await (await request.get(`/badge/${TOOL}.svg?style=verified`)).text()).toContain("Verified maker on Try Something");
  await page.goto(`/me/share/${TOOL}`);
  await expect(page.locator(".badge-preview img")).toHaveAttribute("src", `/badge/${TOOL}.svg?style=verified&theme=light`);
  expect(await (await request.get(`/badge/no-such-tool.svg?style=verified`)).text()).toContain("Listed on Try Something");
  sql(`UPDATE tool SET maker_verified_at = NULL WHERE slug = '${TOOL}';`);
});

test("an unowned editorial listing can be claimed by proving the site, and only while unowned", async ({ page }) => {
  sql(`UPDATE tool SET submitted_by = NULL, credit_type = 'editorial', maker_verified_at = NULL WHERE slug = '${TOOL}';`);
  await page.context().clearCookies();
  await page.goto(`/tools/${TOOL}`);
  await page.getByRole("link", { name: "Made it? Claim this listing" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);

  await signIn(page, ben);
  await page.goto(`/me/verify/${TOOL}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Claim Excalidraw");
  await expect(page.locator("[data-copy-src]").last()).toHaveText(/^ts-[0-9a-f]{32}$/);

  // The proof fetch needs a public site (unit-tested); once someone owns the listing, the claim is gone.
  sql(`UPDATE tool SET submitted_by = 'e2e-c-ada', credit_type = 'made', maker_verified_at = '2026-10-22T00:00:00Z' WHERE slug = '${TOOL}';`);
  await page.goto(`/me/verify/${TOOL}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing to try here.");
  await page.goto(`/tools/${TOOL}`);
  await expect(page.getByRole("link", { name: "Made it? Claim this listing" })).toHaveCount(0);
  sql(`UPDATE tool SET submitted_by = NULL, credit_type = 'editorial', maker_verified_at = NULL WHERE slug = '${TOOL}';`);
});

test("the quick view shows the page layout with comments docked beside it", async ({ page }) => {
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".card a[href^='/tools/']").first().click();
  const dialog = page.locator("[data-quick-view]");
  const dock = dialog.locator(".detail-dock [data-comments]");
  await expect(dock).toBeVisible();
  await expect(dock.locator("h2")).toContainText("Comments");
  // The dock already shows the comments, so the in-page link to them is hidden.
  await expect(dialog.locator(".detail-comments")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("on a phone the quick view's comments link scrolls to the comments in the view", async ({ page }) => {
  await page.context().clearCookies();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.locator(".card a[href^='/tools/']").first().click();
  const dialog = page.locator("[data-quick-view]");
  const url = page.url();
  await dialog.locator(".detail-comments").click();
  await expect(dialog.locator("[data-comments] h2")).toBeInViewport();
  expect(page.url()).toBe(url);
  await expect(dialog).toBeVisible();
});
