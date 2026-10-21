import { trackingAllowed } from "./discovery";

// Small browser helpers shared by page scripts. Skeleton styles live under "Home list loading" in global.css.
export function skeletonCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "card skeleton";
  card.setAttribute("aria-hidden", "true");
  for (const cls of ["sk sk-cover", "sk sk-title", "sk sk-line", "sk sk-line sk-short", "sk-actions"]) {
    const el = document.createElement("div");
    el.className = cls;
    if (cls === "sk-actions") for (let k = 0; k < 2; k++) el.appendChild(document.createElement("span"));
    card.appendChild(el);
  }
  return card;
}

export async function fetchDocument(url: string, signal?: AbortSignal): Promise<Document> {
  const res = await fetch(url, { signal, headers: { accept: "text/html" } });
  if (!res.ok) throw new Error(String(res.status));
  return new DOMParser().parseFromString(await res.text(), "text/html");
}

/** Cards, Save buttons and covers inserted after load need the page scripts to look at them again. */
export function announceContent() {
  document.dispatchEvent(new Event("ts:content"));
}

/** Counts a tool page view (deduplicated server-side per visitor per day), with the surface it came from. */
export function sendView(toolId: string, surface: string | null) {
  if (!trackingAllowed) return;
  navigator.sendBeacon("/api/view", new Blob([JSON.stringify({ toolId, surface })], { type: "application/json" }));
}

interface ConfirmOptions {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
}

/** Themed confirm (ConfirmDialog in Base). Resolves false on Cancel, Escape or a click outside. */
export function askConfirm({ title, body, confirm, danger = false }: ConfirmOptions): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>("[data-confirm-dialog]");
  if (!dialog) return Promise.resolve(window.confirm(`${title}\n\n${body}`));
  dialog.querySelector("[data-confirm-title]")!.textContent = title;
  dialog.querySelector("[data-confirm-body]")!.textContent = body;
  const ok = dialog.querySelector<HTMLButtonElement>("[data-confirm-ok]")!;
  ok.textContent = confirm;
  ok.classList.toggle("btn-danger", danger);
  ok.classList.toggle("btn-dark", !danger);
  dialog.returnValue = "";
  dialog.showModal();
  // Start on Cancel, so a stray Enter never confirms something destructive.
  dialog.querySelector<HTMLButtonElement>("[data-confirm-cancel]")!.focus();
  return new Promise((resolve) => {
    const outside = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close("cancel");
    };
    dialog.addEventListener("click", outside);
    dialog.addEventListener(
      "close",
      () => {
        dialog.removeEventListener("click", outside);
        resolve(dialog.returnValue === "ok");
      },
      { once: true },
    );
  });
}
