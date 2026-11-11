import { expect, test } from "@playwright/test";
import { createUser, sql, sqlJson } from "./helpers";

const SUB = "e2e-fol-sub";

test.afterAll(() => {
  sql(`
    DELETE FROM tool WHERE submission_id = '${SUB}';
    DELETE FROM submission WHERE id = '${SUB}';
    DELETE FROM "user" WHERE id IN ('e2e-fol-finder', 'e2e-fol-fan', 'e2e-fol-mod');
  `);
});

test("follow a finder, then hear about and see their next published tool", async ({ page }) => {
  const finder = await createUser("e2e-fol-finder", "Fin Der", "user");
  const fan = await createUser("e2e-fol-fan", "Fan Atic", "user");
  const mod = await createUser("e2e-fol-mod", "Mod Fol", "moderator");
  sql(`UPDATE "user" SET handle = 'fol-finder' WHERE id = 'e2e-fol-finder';`);
  const as = async (u: typeof fan) => {
    await page.context().clearCookies();
    await page.context().addCookies([{ ...u.cookie, httpOnly: true, sameSite: "Lax" }]);
  };

  // Signed out, Follow asks to sign in first.
  await page.goto("/users/fol-finder");
  await expect(page.locator(".profile-actions .follow-btn")).toHaveAttribute("href", /^\/login\?next=/);

  await as(fan);
  await page.goto("/me/following");
  await expect(page.getByRole("heading", { name: "You're not following anyone yet" })).toBeVisible();
  await page.goto("/users/fol-finder");
  const follow = page.getByRole("button", { name: "Follow Fin Der" });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(follow).toHaveText("Following");
  await expect.poll(() => sqlJson<{ n: number }>(`SELECT COUNT(*) AS n FROM follow WHERE follower_id = 'e2e-fol-fan' AND followee_id = 'e2e-fol-finder'`)[0].n).toBe(1);

  // Nobody follows themselves.
  await as(finder);
  await page.goto("/users/fol-finder");
  await expect(page.locator(".profile-actions .follow-btn")).toHaveCount(0);

  const now = new Date().toISOString();
  sql(`DELETE FROM tool WHERE submission_id = '${SUB}'; DELETE FROM submission WHERE id = '${SUB}';
    INSERT INTO submission (id, user_id, origin, url, canonical_key, name, tagline, try_this, category, status, created_at, updated_at)
      VALUES ('${SUB}', 'e2e-fol-finder', 'found', 'https://example.com/followed', 'example.com/followed', 'E2E Followed Find', 'A find worth following.', 'Click the thing.', 'play', 'pending', '${now}', '${now}');`);
  await as(mod);
  await page.goto(`/admin/submissions/${SUB}`);
  await page.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.getByRole("status")).toContainText("Published at /tools/");

  await as(fan);
  await page.goto("/me/notifications");
  const notice = page.locator(".notif", { hasText: "Fin Der listed E2E Followed Find" });
  await expect(notice).toContainText("A find worth following.");
  await page.goto("/me/following");
  await expect(page.locator(".grid .card h2")).toHaveText(["E2E Followed Find"]);
  await expect(page.locator(".following-people")).toContainText("@fol-finder");

  // The tool page offers Follow next to the finder, already on.
  await page.locator(".grid .card h2 a").click();
  await expect(page.locator(".credits").getByRole("button", { name: "Follow Fin Der" })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".credits").getByRole("button", { name: "Follow Fin Der" }).click();
  await expect.poll(() => sqlJson<{ n: number }>(`SELECT COUNT(*) AS n FROM follow WHERE follower_id = 'e2e-fol-fan'`)[0].n).toBe(0);
});
