import { expect, test } from "@playwright/test";
import { createUser, sql } from "./helpers";

const tool = (n: number, by: string, credit: "made" | "found", verified: boolean) => {
  const now = new Date(Date.now() - n * 1000).toISOString();
  return `INSERT INTO tool (id, slug, name, url, canonical_key, tagline, try_this, why, category, tags, art, status, featured, credit_type, submitted_by, maker_verified_at, published_at, updated_at)
    VALUES ('e2e-show-${n}', 'e2e-show-${n}', 'E2E Show ${n}', 'https://e2e-show-${n}.example/', 'e2e-show-${n}.example', 'A showcase test tool.', 'Click it.', '', 'play', '[]', '{}', 'published', 0,
      '${credit}', '${by}', ${verified ? `'${now}'` : "NULL"}, '${now}', '${now}');`;
};

test.afterAll(() => {
  sql(`DELETE FROM tool WHERE id LIKE 'e2e-show-%'; DELETE FROM "user" WHERE id IN ('e2e-show-maker', 'e2e-show-finder');`);
});

test("home and /makers show the people behind tools, their lists and an example stats card", async ({ page }) => {
  await createUser("e2e-show-maker", "Showcase Maker", "user");
  await createUser("e2e-show-finder", "Showcase Finder", "user");
  sql(`DELETE FROM tool WHERE id LIKE 'e2e-show-%';
    UPDATE "user" SET handle = id WHERE id IN ('e2e-show-maker', 'e2e-show-finder');
    ${tool(1, "e2e-show-maker", "made", true)}
    ${tool(2, "e2e-show-maker", "made", false)}
    ${tool(3, "e2e-show-finder", "found", false)}
    ${tool(4, "e2e-show-finder", "found", false)}
    INSERT INTO user_list (id, user_id, slug, title, description, public, created_at, updated_at)
      VALUES ('e2e-show-list', 'e2e-show-finder', 'showcase-picks', 'Showcase picks', '', 1, '${new Date().toISOString()}', '${new Date().toISOString()}');
    INSERT INTO user_list_item (list_id, tool_id, created_at) SELECT 'e2e-show-list', id, '${new Date().toISOString()}' FROM tool WHERE id LIKE 'e2e-show-%';`);

  await page.goto("/");
  const people = page.locator("[data-surface=community]");
  await expect(people.getByRole("heading", { name: "Made and found by people" })).toBeVisible();
  const maker = people.locator(".showcase-card", { hasText: "Showcase Maker" });
  await expect(maker).toHaveAttribute("href", "/users/e2e-show-maker");
  await expect(maker).toContainText("Verified maker");
  await expect(maker).toContainText("2 tools");
  await expect(maker.locator(".showcase-covers .cover")).toHaveCount(2);
  const list = people.locator(".showcase-card", { hasText: "Showcase picks" });
  await expect(list).toHaveAttribute("href", "/users/e2e-show-finder/lists/showcase-picks");
  await expect(list).toContainText("Showcase Finder · 4 tools");

  // A list below the indexing size stays off the home page.
  sql(`DELETE FROM user_list_item WHERE list_id = 'e2e-show-list' AND tool_id IN ('e2e-show-1', 'e2e-show-2');`);
  await page.reload();
  await expect(people.locator(".showcase-card", { hasText: "Showcase picks" })).toHaveCount(0);

  // /makers lists only verified makers, and its stats card is labelled as an example.
  await page.goto("/makers");
  const verified = page.locator("[data-surface=makers] .showcase-card");
  await expect(verified.filter({ hasText: "Showcase Maker" })).toHaveCount(1);
  await expect(verified.filter({ hasText: "Showcase Finder" })).toHaveCount(0);
  await expect(page.locator(".maker-preview-tag")).toHaveText("Example · made-up numbers");
  await expect(page.locator(".maker-preview .maker-tool")).toHaveAttribute("inert", "");
});

test("a tool page leaves out zero counts", async ({ page }) => {
  sql(`DELETE FROM tool WHERE id = 'e2e-show-9'; ${tool(9, "e2e-show-maker", "made", false).replace("'e2e-show-maker'", "NULL")}`);
  await page.goto("/tools/e2e-show-9");
  const stats = page.locator(".detail-head .stats-lg");
  await expect(stats.locator(".stat-like [data-n='0']")).toBeHidden();
  await expect(stats.locator(".stat:not(.stat-like)")).toHaveCount(2);
  for (const s of await stats.locator(".stat:not(.stat-like)").all()) await expect(s).toBeHidden();
  await expect(page.locator(".comments-count")).toBeHidden();
});
