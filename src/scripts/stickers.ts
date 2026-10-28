// Animated stickers. The kit and drawings load only on pages that show one, through a dynamic import.
// A sticker plays once when it first comes into view and rests on its still frame; reduced motion shows only that frame.
import type { StickerName } from "../stickers/icons";

type Kit = typeof import("../stickers/icons") & { play: typeof import("../stickers/fun").play };
let kit: Promise<Kit> | null = null;
const load = () =>
  (kit ??= Promise.all([import("../stickers/icons"), import("../stickers/fun")]).then(([icons, fun]) => ({ ...icons, play: fun.play })));

const mounted = new WeakSet<HTMLCanvasElement>();

/** Starts every `canvas[data-sticker]` not yet playing. A `[data-sticker-replay]` ancestor replays it on hover or focus. */
export async function mountStickers(root: Element | Document = document) {
  const canvases = [...root.querySelectorAll<HTMLCanvasElement>("canvas[data-sticker]")].filter((c) => !mounted.has(c));
  if (!canvases.length) return;
  const { STICKERS, BRAND, play } = await load();
  for (const canvas of canvases) {
    const icon = STICKERS[canvas.dataset.sticker as StickerName];
    if (!icon || mounted.has(canvas)) continue;
    mounted.add(canvas);
    const player = play(canvas, icon, { palette: BRAND, loop: canvas.dataset.loop === "true", enter: canvas.dataset.enter ? Number(canvas.dataset.enter) : undefined });
    const host = canvas.closest<HTMLElement>("[data-sticker-replay]");
    host?.addEventListener("pointerenter", () => player.replay());
    host?.addEventListener("focusin", () => player.replay());
  }
}

/** A sticker canvas built in script, for UI that only sometimes shows one; start it with mountStickers. */
export function stickerCanvas(name: StickerName, className = "sticker sticker-sm") {
  const c = document.createElement("canvas");
  c.className = className;
  c.dataset.sticker = name;
  c.setAttribute("aria-hidden", "true");
  return c;
}

/** Plays a sticker once over an element (a heart over the Heart button), then removes it. */
export async function burst(anchor: Element, name: StickerName) {
  const { STICKERS } = await load();
  const r = anchor.getBoundingClientRect();
  const c = stickerCanvas(name, "sticker-burst");
  c.style.setProperty("--x", `${r.left + r.width / 2}px`);
  c.style.setProperty("--y", `${r.top + r.height / 2}px`);
  document.body.appendChild(c);
  await mountStickers(document.body);
  setTimeout(() => c.remove(), (STICKERS[name].still || STICKERS[name].frames) * (1000 / 60) + 200);
}

/** A short toast with a sticker, for a first-time moment. Replaces any toast already showing. */
export async function stickerToast(name: StickerName, title: string, body: string, link?: { href: string; label: string }) {
  document.querySelector(".sticker-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "sticker-toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  text.appendChild(strong);
  text.appendChild(p);
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    text.appendChild(a);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "sticker-toast-close";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => toast.remove());
  for (const el of [stickerCanvas(name, "sticker sticker-sm"), text, close]) toast.appendChild(el);
  document.body.appendChild(toast);
  await mountStickers(toast);
  setTimeout(() => toast.remove(), 7000);
}
