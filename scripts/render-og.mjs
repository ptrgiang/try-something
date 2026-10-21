// Renders scripts/og.html to public/og-default.png (1200x630).
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(resolve("scripts/og.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "public/og-default.png" });
await browser.close();
console.log("wrote public/og-default.png");
