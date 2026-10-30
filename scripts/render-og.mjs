// Renders scripts/og.html to public/og-default.png (1200x630) and docs/assets/social-preview.png (1280x640), the image
// uploaded by hand in the repo's Settings > Social preview.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const url = pathToFileURL(resolve("scripts/og.html")).href;
const browser = await chromium.launch();
for (const [query, width, height, path] of [
  ["", 1200, 630, "public/og-default.png"],
  ["?repo", 1280, 640, "docs/assets/social-preview.png"],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url + query);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path });
  await page.close();
  console.log(`wrote ${path}`);
}
await browser.close();
