// Renders the header logo to PNGs for README.md. GitHub can't load web fonts inside an SVG <img>,
// so the wordmark is rasterised here with the site's own Manrope.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const font = readFileSync("node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2").toString("base64");
const mark = (ink) => `<svg viewBox="0 0 32 32"><path d="M12 10.5v17.2l4.6-4.3 3.3 6.6 3.2-1.6-3.3-6.5h6.2z" fill="${ink}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/><g stroke="#ff6a45" stroke-width="2.6" stroke-linecap="round"><path d="M8.6 7.4 6 4.8M12 6V2.6M15.4 7.4 18 4.8"/></g></svg>`;

const browser = await chromium.launch();
for (const [file, ink] of [
  ["docs/assets/logo.png", "#17141f"],
  ["docs/assets/logo-dark.png", "#fffdf9"],
]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 2 });
  await page.setContent(`<style>
    @font-face{font-family:M;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:200 800}
    html,body{margin:0;background:transparent}
    .logo{display:inline-flex;align-items:center;gap:22px;padding:8px;font:800 88px/1 M;letter-spacing:-.02em;color:${ink}}
    svg{width:112px;height:112px}.ing{color:#ff6a45}
  </style><div class="logo">${mark(ink)}<span>trysometh<span class="ing">.ing</span></span></div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".logo").screenshot({ path: file, omitBackground: true });
  await page.close();
  console.log(`wrote ${file}`);
}
await browser.close();
