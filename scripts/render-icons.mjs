// Renders public/favicon.svg to the PNG icons browsers and iOS ask for.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/favicon.svg", "utf8");
const browser = await chromium.launch();
for (const [file, size, radius] of [
  ["public/favicon-32.png", 32, true],
  // iOS applies its own rounded mask, so the touch icon is a full square.
  ["public/apple-touch-icon.png", 180, false],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const body = radius ? svg : svg.replace(/ rx="8"/, "");
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${body}`);
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
  console.log(`wrote ${file}`);
}
await browser.close();
