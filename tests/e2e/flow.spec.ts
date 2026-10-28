import { expect, test, type Page } from "@playwright/test";
import { cleanup, createUser, sql, sqlJson, type TestUser } from "./helpers";

let submitter: TestUser;
let moderator: TestUser;

test.beforeAll(async () => {
  cleanup();
  submitter = await createUser("e2e-submitter", "Sam Submitter", "user");
  moderator = await createUser("e2e-moderator", "Mo Moderator", "moderator");
});

test.afterAll(() => cleanup());

async function signIn(page: Page, user: TestUser) {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...user.cookie, httpOnly: true, sameSite: "Lax" }]);
}

async function waitForTurnstile(page: Page) {
  await expect(page.locator('[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
}

const XSS = `<img src=x onerror="window.__xss=1">`;

async function pngFromBrowser(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ff6a45";
    g.fillRect(0, 0, w, h);
    return c.toDataURL("image/png");
  }, [width, height]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test.describe.configure({ mode: "serial" });

test("visitor can discover, search, surprise and save without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Discover tools worth");
  await expect(page.locator(".grid .card")).toHaveCount(12);
  await page.getByRole("searchbox", { name: "Search tools" }).fill("json");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/explore\?q=json/);
  // Name matches rank above tools that only mention the term.
  await expect(page.locator(".grid .card h2").first()).toHaveText("JSON Crack");

  await page.locator(".card .save-btn").first().click();
  await expect(page.locator(".card .save-btn").first()).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator(".card .save-btn").first()).toHaveAttribute("aria-pressed", "true");

  const res = await page.goto("/surprise");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/tools\/[a-z0-9-]+$/);
  const tryLink = page.getByRole("link", { name: /Try it on/ });
  await expect(tryLink).toHaveAttribute("target", "_blank");
  await expect(tryLink).toHaveAttribute("rel", /noopener/);
});

test("anonymous submit is gated and protected pages redirect to login", async ({ page }) => {
  await page.goto("/submit");
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toBeVisible();
  await page.goto("/admin/submissions");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsubmissions|\/login\?next=\/admin\/submissions/);
});

test("hearts need an account and update the real count", async ({ page }) => {
  await page.goto("/tools/excalidraw");
  await page.locator(".detail [data-like]").click();
  await expect(page).toHaveURL(/\/login\?next=%2Ftools%2Fexcalidraw/);

  sql(`DELETE FROM tool_like WHERE user_id = '${submitter.id}'`);
  await signIn(page, submitter);
  await page.goto("/tools/excalidraw");
  const heart = page.locator(".detail [data-like]");
  const count = heart.locator("[data-count]");
  const before = Number(await count.getAttribute("data-n"));
  // The count updates optimistically; reload only once the server has the heart.
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/likes") && r.request().method() === "POST");
  await heart.click();
  await saved;
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText(String(before + 1));
  await page.reload();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText(String(before + 1));
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => sqlJson(`SELECT 1 FROM tool_like WHERE user_id = '${submitter.id}'`).length).toBe(0);
});

test("cross-site form posts are rejected", async ({ request }) => {
  const res = await request.post("/submit", {
    headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded", cookie: `${submitter.cookie.name}=${submitter.cookie.value}` },
    data: "origin=found&url=https://example.org",
  });
  expect(res.status()).toBe(403);
});

test("full flow: submit → needs changes → resubmit → approve → published", async ({ page }) => {
  // 1. Submitter files a submission (the found-it path), including an XSS payload in text.
  await signIn(page, submitter);
  await page.goto("/submit");
  await page.getByLabel("I found this").check();
  await page.getByLabel("Official URL").fill("https://excalidraw.com/?utm_source=e2e");
  await page.getByLabel("Product name").fill("E2E Sketch Pad");
  await page.getByLabel("One-line description").fill(`A whiteboard ${XSS}`);
  await page.getByLabel(/try in 30 seconds/).fill("Draw a box and an arrow");
  await page.getByLabel("Category").selectOption("create");
  await page.getByLabel(/^Tags/).fill("sketch, e2e");
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Submit for review" }).click();

  // Duplicate of an editorial seed (excalidraw.com) must be refused.
  await expect(page.getByText("already listed at /tools/excalidraw")).toBeVisible();

  // The form keeps the user's values after a server-side error; fix the URL and retry.
  await expect(page.getByLabel("Product name")).toHaveValue("E2E Sketch Pad");
  await page.getByLabel("Official URL").fill("https://excalidraw.com/e2e-unique-board");
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/me\/submissions\?submitted=/);
  await expect(page.getByRole("status")).toContainText("pending review");
  await expect(page.locator("tbody tr").first()).toContainText("Pending");

  const [{ id }] = sqlJson<{ id: string }>("SELECT id FROM submission WHERE name = 'E2E Sketch Pad'");

  // 2. Not public yet, and a normal user can't reach admin.
  expect((await page.goto("/tools/e2e-sketch-pad"))?.status()).toBe(404);
  expect((await page.goto("/admin/submissions"))?.status()).toBe(403);
  expect((await page.goto(`/admin/submissions/${id}`))?.status()).toBe(403);

  // 3. Moderator requests changes with a reason.
  await signIn(page, moderator);
  await page.goto("/admin/submissions");
  await page.getByRole("link", { name: "E2E Sketch Pad" }).click();
  await expect(page.getByText("Submitted by a discoverer")).toBeVisible();
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(page.getByRole("status")).toContainText("start review");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Add a reason");
  await page.getByLabel(/Reason/).fill("Please describe what the board does in plain words.");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.locator(".status").first()).toHaveText("Needs changes");

  // 4. Another user cannot open someone else's submission.
  expect((await page.goto(`/me/submissions/${id}`))?.status()).toBe(404);

  // 5. Submitter sees the note, edits, resubmits.
  await signIn(page, submitter);
  await page.goto("/me/submissions");
  // The bell counts the review once, and opening the list clears it.
  await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();
  await page.getByRole("link", { name: "Notifications, 1 unread" }).click();
  await expect(page.locator(".notif.is-unread")).toHaveCount(1);
  await expect(page.locator(".notif").first()).toContainText("E2E Sketch Pad needs changes");
  await expect(page.locator(".notif").first()).toContainText("Please describe what the board does");
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".notif.is-unread")).toHaveCount(0);
  await page.goto("/me/submissions");
  await expect(page.locator("tbody")).toContainText("Please describe what the board does");
  await page.getByRole("link", { name: "Edit & resubmit" }).click();
  await page.getByLabel("One-line description").fill(`A hand-drawn style whiteboard ${XSS}`);
  // Adds a cover: resized in the browser, refused until the rights box is ticked.
  await page.getByLabel(/^Cover image/).setInputFiles({ name: "board.png", mimeType: "image/png", buffer: await pngFromBrowser(page, 900, 500) });
  await expect(page.locator("[data-cover-preview]")).toBeVisible();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Save & resubmit for review" }).click();
  await expect(page.locator("[data-cover-error]")).toContainText("Confirm you may share this image");
  await page.getByLabel(/I have the right to share this image/).check();
  await page.getByRole("button", { name: "Save & resubmit for review" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Pending");
  expect(sqlJson<{ k: string }>(`SELECT image_key AS k FROM submission WHERE id = '${id}'`)[0].k).toMatch(/^sub\/.+\.(webp|jpg)$/);
  // Private until published: signed-out visitors can't see the upload.
  expect((await page.request.get(`/media/submission/${id}`)).status()).toBe(200);
  await page.context().clearCookies();
  expect((await page.request.get(`/media/submission/${id}`)).status()).toBe(404);

  // 6. Moderator approves and publishes.
  await signIn(page, moderator);
  await page.goto(`/admin/submissions/${id}`);
  await expect(page.getByAltText("Uploaded cover for E2E Sketch Pad")).toBeVisible();
  await expect(page.getByLabel("Publish with the uploaded cover")).toBeChecked();
  await page.getByRole("button", { name: "Approve & publish" }).click();
  await expect(page.getByRole("status")).toContainText("Published at /tools/e2e-sketch-pad");
  await expect(page.getByText(/Possible duplicate/)).toHaveCount(0);
  await expect(page.locator(".timeline li")).toHaveCount(5);
  await signIn(page, submitter);
  await page.goto("/me/notifications");
  await page.getByRole("link", { name: /E2E Sketch Pad is live/ }).click();
  await expect(page).toHaveURL(/\/tools\/e2e-sketch-pad$/);

  // 7. Public detail page renders, with escaped user text and discoverer credit.
  await page.context().clearCookies();
  const res = await page.goto("/tools/e2e-sketch-pad");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Sketch Pad");
  await expect(page.getByRole("link", { name: /^Try it on/ })).toHaveAttribute("href", /\?utm_source=trysometh\.ing&utm_medium=referral$/);
  await expect(page.locator(".lede").first()).toContainText("<img src=x");
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator(".credits")).toContainText("Discovered by Sam Submitter");
  await expect(page.locator(".art-note")).toContainText("Cover image provided by the person who submitted");
  const [{ toolId }] = sqlJson<{ toolId: string }>("SELECT id AS toolId FROM tool WHERE slug = 'e2e-sketch-pad'");
  const cover = await page.request.get(`/media/tool/${toolId}`);
  expect(cover.status()).toBe(200);
  expect(cover.headers()["content-type"]).toMatch(/^image\/(webp|jpeg)$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://trysometh.ing/tools/e2e-sketch-pad");
  const index = await (await page.request.get("/sitemap.xml")).text();
  expect(index).toContain("<sitemapindex");
  const sitemap = await (await page.request.get("/sitemaps/tools.xml")).text();
  expect(sitemap).toContain("/tools/e2e-sketch-pad");
  expect(sitemap).toContain(`<image:loc>https://trysometh.ing/media/tool/${toolId}</image:loc>`);
});

test("moderator cannot approve their own submission", async ({ page }) => {
  await signIn(page, moderator);
  await page.goto("/submit");
  await page.getByLabel("I made this").check();
  await page.getByLabel("Official URL").fill("https://example.org/e2e-own");
  await page.getByLabel("Product name").fill("E2E Own Thing");
  await page.getByLabel("One-line description").fill("Something the moderator made");
  await page.getByLabel(/try in 30 seconds/).fill("Click the big button");
  await page.getByLabel("Category").selectOption("fun");
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/me\/submissions/);
  const [{ id }] = sqlJson<{ id: string }>("SELECT id FROM submission WHERE name = 'E2E Own Thing'");
  await page.goto(`/admin/submissions/${id}`);
  await expect(page.getByText("another moderator has to review it")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve & publish" })).toHaveCount(0);
  // Tampered form post is still refused server-side.
  const res = await page.request.post(`/admin/submissions/${id}`, {
    headers: { origin: new URL(page.url()).origin },
    form: { action: "approve", reason: "" },
  });
  expect(res.status()).toBe(403);
});
