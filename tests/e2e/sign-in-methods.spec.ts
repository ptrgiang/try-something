import { expect, test } from "@playwright/test";
import { createUser, sql, sqlJson, type TestUser } from "./helpers";

// One person, one account: linked providers are listed and removable, never down to zero.
// The OAuth round trip itself needs real provider keys, so it's checked on staging.
let ida: TestUser;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  ida = await createUser("e2e-m-ida", "Ida Methods", "user");
  const now = new Date().toISOString();
  sql(`
    INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES
      ('e2e-m-acc-gh', 'gh-123', 'github', '${ida.id}', '${now}', '${now}'),
      ('e2e-m-acc-go', 'go-456', 'google', '${ida.id}', '${now}', '${now}');
  `);
});

test.afterAll(() => {
  sql(`DELETE FROM "user" WHERE id LIKE 'e2e-m-%';`);
});

test("linked providers are listed and can be removed, but never the last one", async ({ page }) => {
  await page.context().addCookies([{ ...ida.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/me/settings");
  await page.getByRole("link", { name: "Sign-in methods" }).click();
  await expect(page.getByRole("heading", { name: "Sign-in methods", level: 2 })).toBeVisible();

  const github = page.locator('[data-method="github"]');
  const google = page.locator('[data-method="google"]');
  await expect(github).toContainText("Connected since");
  await expect(google).toContainText("Connected since");

  const confirmBox = page.locator("[data-confirm-dialog]");
  await github.getByRole("button", { name: "Disconnect" }).click();
  await expect(confirmBox.getByRole("heading", { name: "Disconnect GitHub?" })).toBeVisible();
  await confirmBox.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmBox).not.toBeVisible();
  await expect(github).toContainText("Connected since");

  await github.getByRole("button", { name: "Disconnect" }).click();
  await confirmBox.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("status")).toContainText("GitHub is disconnected.");
  expect(sqlJson<{ providerId: string }>(`SELECT "providerId" FROM "account" WHERE "userId" = '${ida.id}'`).map((r) => r.providerId)).toEqual(["google"]);

  await expect(google).toContainText("Your only connected account");
  await expect(google.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
});

test("only the linking endpoints were opened, and only same-site", async ({ request }) => {
  const cookie = `${ida.cookie.name}=${ida.cookie.value}`;
  const update = await request.post("/api/auth/update-user", { data: { name: "Hijacked" }, headers: { cookie } });
  expect(update.status()).toBe(404);
  const crossSite = await request.post("/api/auth/unlink-account", { data: { providerId: "google", accountId: "go-456" }, headers: { cookie, origin: "https://evil.example" } });
  expect(crossSite.status()).toBe(403);
  expect(sqlJson<{ n: number }>(`SELECT COUNT(*) AS n FROM "account" WHERE "userId" = '${ida.id}'`)[0].n).toBe(1);
});

test("connect errors and refused joins are explained", async ({ page }) => {
  await page.context().addCookies([{ ...ida.cookie, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/me/settings/sign-in?error=account_already_linked_to_different_user");
  await expect(page.getByRole("alert").first()).toContainText("already signs in to a different Try Something account");

  await page.context().clearCookies();
  await page.goto("/login?error=account_not_linked");
  await expect(page.getByRole("alert").first()).toContainText("Sign in the way you did before");
  await page.goto("/login?error=email_not_verified");
  await expect(page.getByRole("alert").first()).toContainText("isn't verified");
});
