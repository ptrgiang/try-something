// Draws share cards to PNG inside the Worker: satori lays out the tree, resvg rasterizes the SVG.
// Workers can't compile wasm from bytes at runtime, so both modules are imported precompiled.

import satori, { init as initSatori } from "satori/standalone";
import yoga from "satori/yoga.wasm";
import { Resvg, initWasm as initResvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
// satori reads WOFF but not WOFF2; latin-ext covers Vietnamese and most European names.
import frauncesLatin from "@fontsource/fraunces/files/fraunces-latin-700-normal.woff?inline";
import frauncesExt from "@fontsource/fraunces/files/fraunces-latin-ext-700-normal.woff?inline";
import manropeLatin from "@fontsource/manrope/files/manrope-latin-500-normal.woff?inline";
import manropeExt from "@fontsource/manrope/files/manrope-latin-ext-500-normal.woff?inline";
import manropeBoldLatin from "@fontsource/manrope/files/manrope-latin-700-normal.woff?inline";
import manropeBoldExt from "@fontsource/manrope/files/manrope-latin-ext-700-normal.woff?inline";
import { OG_HEIGHT, OG_WIDTH, ogTree, type OgCard } from "./og";

const bytes = (dataUri: string) => Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(",") + 1)), (c) => c.charCodeAt(0)).buffer;

let ready: Promise<void> | null = null;
const setup = () =>
  (ready ??= Promise.all([initSatori(yoga), initResvg(resvgWasm)]).then(
    () => {},
    (e) => {
      ready = null;
      throw e;
    },
  ));

let fonts: Parameters<typeof satori>[1]["fonts"] | null = null;
const loadFonts = () =>
  (fonts ??= [
    { name: "Fraunces", data: bytes(frauncesLatin), weight: 700, style: "normal" },
    { name: "Fraunces", data: bytes(frauncesExt), weight: 700, style: "normal" },
    { name: "Manrope", data: bytes(manropeLatin), weight: 500, style: "normal" },
    { name: "Manrope", data: bytes(manropeExt), weight: 500, style: "normal" },
    { name: "Manrope", data: bytes(manropeBoldLatin), weight: 700, style: "normal" },
    { name: "Manrope", data: bytes(manropeBoldExt), weight: 700, style: "normal" },
  ]);

export async function renderOgPng(card: OgCard, covers: Map<string, string>): Promise<Uint8Array<ArrayBuffer>> {
  await setup();
  const svg = await satori(ogTree(card, covers) as unknown as Parameters<typeof satori>[0], { width: OG_WIDTH, height: OG_HEIGHT, fonts: loadFonts() });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } });
  try {
    return resvg.render().asPng() as Uint8Array<ArrayBuffer>;
  } finally {
    resvg.free();
  }
}

/** A cover as a small JPEG data URI for the card; resvg can't decode WebP. Null when it can't be converted. */
export async function coverDataUri(images: ImagesBinding | undefined, cover: { bytes: Uint8Array }): Promise<string | null> {
  if (!images) return null;
  try {
    const out = await images
      .input(new Blob([cover.bytes as Uint8Array<ArrayBuffer>]).stream())
      .transform({ width: 520, height: 344, fit: "cover" })
      .output({ format: "image/jpeg", quality: 82 });
    const jpeg = new Uint8Array(await out.response().arrayBuffer());
    let bin = "";
    for (let i = 0; i < jpeg.length; i += 0x8000) bin += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}
