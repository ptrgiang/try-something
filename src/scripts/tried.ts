// "Tried" marks: tools this browser opened with a Try button. They live in localStorage on this device only and are
// never sent anywhere except as `skip` on Surprise me and Discover links, which only steer the next pick.

const KEY = "ts:tried";
const MAX = 300;
/** Slugs sent as `skip`; matches SKIP_MAX in lib/discover.ts. */
const SKIP_SENT = 30;

export interface TriedEntry {
  id: string;
  slug: string;
  at: number;
}

export function triedList(): TriedEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string" && typeof e.slug === "string") : [];
  } catch {
    return [];
  }
}

function record(id: string, slug: string) {
  const list = triedList().filter((e) => e.id !== id);
  list.push({ id, slug, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {}
}

export function clearTried() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  paint();
}

const dayLabel = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Marks cards and the tool page for tools tried on this device. Safe to run again after content swaps. */
export function paint() {
  const tried = new Map(triedList().map((e) => [e.id, e]));
  document.querySelectorAll<HTMLElement>(".card[data-impression]").forEach((card) => {
    const hit = tried.has(card.dataset.impression!);
    card.classList.toggle("is-tried", hit);
    let chip = card.querySelector<HTMLElement>(":scope > .tried-chip");
    if (hit && !chip) {
      chip = document.createElement("span");
      chip.className = "tried-chip";
      chip.textContent = "Tried";
      card.querySelector<HTMLElement>(".card-cover")?.insertAdjacentElement("afterend", chip);
    } else if (!hit) chip?.remove();
  });
  // The tool page, and the same markup inside quick view.
  document.querySelectorAll<HTMLElement>(".detail[data-tool-id]").forEach((detail) => {
    const mine = tried.get(detail.dataset.toolId!);
    let note = detail.querySelector<HTMLElement>(".tried-note");
    if (!mine) return note?.remove();
    if (!note) {
      note = document.createElement("p");
      note.className = "tried-note";
      detail.querySelector<HTMLElement>(".detail-head")?.appendChild(note);
    }
    note.textContent = `You opened this on ${dayLabel(mine.at)}. `;
    const link = document.createElement("a");
    link.href = "/tried";
    link.textContent = "Everything you've tried";
    note.appendChild(link);
  });
}

// auxclick catches a middle-click, which opens the site in a new tab without firing "click".
const noteTry = (e: MouseEvent) => {
  if (e.type === "auxclick" && e.button !== 1) return;
  const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-try][data-slug]");
  if (!link) return;
  record(link.dataset.try!, link.dataset.slug!);
  // After the new tab opens, so the mark never gets in the way of the click.
  setTimeout(paint, 300);
};
document.addEventListener("click", noteTry);
document.addEventListener("auxclick", noteTry);

document.addEventListener(
  "click",
  (e) => {
    const target = e.target as Element;
    // Surprise me, and the mood chips that start a Discover round (later links carry `skip` from the server).
    const link = target.closest<HTMLAnchorElement>('a[href^="/surprise"], a[data-deal="mood"]');
    if (!link) return;
    const skip = triedList().slice(-SKIP_SENT).map((e) => e.slug);
    if (!skip.length) return;
    const url = new URL(link.href, location.href);
    url.searchParams.set("skip", skip.join(","));
    link.href = url.pathname + url.search;
  },
  true,
);

paint();
document.addEventListener("ts:content", paint);
// Another tab may have tried something since this page loaded.
window.addEventListener("pageshow", paint);
window.addEventListener("storage", (e) => e.key === KEY && paint());
