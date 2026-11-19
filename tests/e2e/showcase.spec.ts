import { expect, test } from "@playwright/test";
import { createUser, sql } from "./helpers";

const tool = (n: number, by: string, credit: "made" | "found", verified: boolean) => {
  const now = new Date(Date.now() - n * 1000).toISOString();
  return `INSERT INTO tool (id, slug, name, url, canonical_key, tagline, try_this, why, category, tags, art, status, featured, credit_type, submitted_by, maker_verified_at, published_at, updated_at)
    VALUES ('e2e-show-${n}', 'e2e-show-${n}', 'E2E Show ${n}', 'https://e2e-show-${n}.example/', 'e2e-show-${n}.example', 'A showcase test tool.', 'Click it.', '', 'play', '[]', '{}', 'published', 0,
      '${credit}', '${by}', ${verified ? `'${now}'` : "NULL"}, '${now}', '${now}');`;
};

test.afterAll(() => {
  sql(`DELETE FROM tool WHERE id LIKE 'e2e-show-%'; DELETE FROM "user" WHERE id IN ('e2e-show-maker', 'e2e-show-finder', 'e2e-show-staff');`);
});

test("home and /makers show the people behind tools, their lists and an example stats card", async ({ page }) => {
  await createUser("e2e-show-maker", "Showcase Maker", "user");
  await createUser("e2e-show-finder", "Showcase Finder", "user");
  sql(`DELETE FROM tool WHERE id LIKE 'e2e-show-%';
    UPDATE "user" SET handle = id WHERE id IN ('e2e-show-maker', 'e2e-show-finder');
    ${tool(0, "e2e-show-maker", "found", false)}
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
  // Made and found are counted apart, and the cover strip leads with what they made, newest found or not.
  await expect(maker).toContainText("2 made · 1 found");
  await expect(maker.locator(".showcase-covers .cover")).toHaveCount(3);
  await expect(maker.locator(".showcase-covers .cover").first()).toContainText("E2E Show 1");
  const list = people.locator(".showcase-card", { hasText: "Showcase picks" });
  await expect(list).toHaveAttribute("href", "/users/e2e-show-finder/lists/showcase-picks");
  await expect(list).toContainText("Showcase Finder · 5 tools");

  // A list below the indexing size stays off the home page.
  sql(`DELETE FROM user_list_item WHERE list_id = 'e2e-show-list' AND tool_id IN ('e2e-show-0', 'e2e-show-1', 'e2e-show-2');`);
  await page.reload();
  await expect(people.locator(".showcase-card", { hasText: "Showcase picks" })).toHaveCount(0);

  // /makers lists only verified makers, and its stats card is labelled as an example.
  await page.goto("/makers");
  const verified = page.locator("[data-surface=makers] .showcase-card");
  await expect(verified.filter({ hasText: "Showcase Maker" })).toHaveCount(1);
  await expect(verified.filter({ hasText: "Showcase Finder" })).toHaveCount(0);
  // A maker's card here shows only what they made.
  await expect(verified.filter({ hasText: "Showcase Maker" }).locator(".showcase-covers .cover")).toHaveCount(2);
  await expect(verified.filter({ hasText: "Showcase Maker" }).locator(".showcase-covers")).not.toContainText("E2E Show 0");
  if ((await page.locator("[data-surface=makers] .showcase-card:not(.showcase-invite)").count()) < 4) {
    await expect(page.locator("[data-surface=makers] .showcase-invite")).toContainText("Your tool could be next");
  }
  await expect(page.locator(".maker-preview-tag")).toHaveText("Example · made-up numbers");
  await expect(page.locator(".maker-preview .maker-tool")).toHaveAttribute("inert", "");
});

test("credit sits by the title, and a profile says which made tools were verified", async ({ page }) => {
  await page.goto("/tools/e2e-show-1");
  await expect(page.locator(".detail-head .byline")).toContainText("Made by Showcase Maker");
  await expect(page.locator(".detail-head .byline .verified-chip")).toBeVisible();
  await expect(page.locator(".detail-head .byline a")).toHaveAttribute("href", "/users/e2e-show-maker");
  await page.goto("/tools/e2e-show-0");
  await expect(page.locator(".detail-head .byline")).toHaveText(/Found by\s+Showcase Maker/);

  await page.goto("/users/e2e-show-maker");
  await expect(page.locator(".profile-handle .verified-chip")).toBeVisible();
  await expect(page.locator(".profile-intro")).toHaveText("Try Something checked 1 of these; the rest are listed as theirs but not verified.");
  await expect(page.locator(".profile-stats")).not.toContainText("hearts");
});

test("a tool made by someone who runs the site says so; actions keep Try it and Save on their own row", async ({ page }) => {
  await createUser("e2e-show-staff", "Showcase Staff", "moderator");
  sql(`UPDATE "user" SET handle = id WHERE id = 'e2e-show-staff'; DELETE FROM tool WHERE id = 'e2e-show-7'; ${tool(7, "e2e-show-staff", "made", true)}`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tools/e2e-show-7");
  await expect(page.locator(".detail-head .byline .team-tag")).toHaveText("Try Something team");
  const top = async (name: RegExp) => (await page.locator(".tool-actions").getByRole("link", { name }).or(page.locator(".tool-actions").getByRole("button", { name })).first().boundingBox())!.y;
  expect(await top(/^Save$/)).toBe(await top(/^Try it on/));
  const second = await top(/^Add to list$/);
  expect(second).toBeGreaterThan(await top(/^Try it on/));
  expect(await top(/^Share$/)).toBe(second);
  expect(await top(/^Another one$/)).toBe(second);
  // In the editors' hero it carries the tag there too. The hero opens on a different slide each day, so find its slide.
  sql(`UPDATE tool SET featured = 0.5 WHERE id = 'e2e-show-7';`);
  try {
    await page.goto("/");
    await expect(page.locator(".featured .slide[data-impression='e2e-show-7'] .team-tag")).toHaveText("Made by the Try Something team");
  } finally {
    sql(`UPDATE tool SET featured = 0 WHERE id = 'e2e-show-7';`);
  }
  // A listing by an ordinary maker carries no team tag.
  await page.goto("/tools/e2e-show-1");
  await expect(page.locator(".team-tag")).toHaveCount(0);
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
