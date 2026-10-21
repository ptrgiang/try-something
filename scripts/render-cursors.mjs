// Renders the brand cursors as PNGs (1x and 2x) into public/cursors/.
// Like system cursors: straight edges sit exactly on pixel boundaries (sharp), diagonal edges are
// anti-aliased with transparency (smooth), and the white outline is a real stroke, not a dilated mask.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// Coordinates in CSS pixels on a 32×32 canvas. Integer coordinates keep vertical and horizontal
// edges crisp. Hotspots: arrow tip (10, 9), I-beam center (16, 16).
const ARROW = [[10, 9], [10, 25], [14, 21], [17, 27.5], [19.6, 26.3], [16.7, 20], [22, 20]];
const BURST = [[[7, 6], [4.5, 3.5]], [[10, 5], [10, 1.5]], [[13, 6], [15.5, 3.5]]];
const IBEAM = [[12, 6, 20, 8], [15, 8, 17, 24], [12, 24, 20, 26]];

const CURSORS = {
  default: { arrow: true },
  pointer: { arrow: true, burst: true },
  text: { ibeam: true },
};

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync("public/cursors", { recursive: true });
for (const [name, spec] of Object.entries(CURSORS)) {
  for (const scale of [1, 2]) {
    const dataUrl = await page.evaluate(
      ({ spec, scale, ARROW, BURST, IBEAM }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32 * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        const shape = new Path2D();
        if (spec.arrow) {
          ARROW.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
          shape.closePath();
        }
        if (spec.ibeam) for (const [x0, y0, x1, y1] of IBEAM) shape.rect(x0, y0, x1 - x0, y1 - y0);
        // Outline: a 4px stroke centred on the edge leaves 2px of white outside the ink. Whole pixels keep
        // both edges of straight sides sharp, and 2px stays solid white on the anti-aliased diagonals.
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.stroke(shape);
        ctx.fillStyle = "#17141f";
        ctx.fill(shape, "nonzero");
        if (spec.burst) {
          ctx.strokeStyle = "#ff6a45";
          ctx.lineWidth = 2;
          ctx.lineCap = "butt";
          for (const [[ax, ay], [bx, by]] of BURST) {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
        return canvas.toDataURL("image/png");
      },
      { spec, scale, ARROW, BURST, IBEAM },
    );
    const file = `public/cursors/${name}${scale === 2 ? "@2x" : ""}.png`;
    writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`wrote ${file}`);
  }
}
await browser.close();
