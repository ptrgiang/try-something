// "Add to list" pickers (components/ListPicker.astro): open, load the signed-in person's lists, toggle and create.

interface ListView {
  id: string;
  title: string;
  public: boolean;
  count: number;
  has: boolean;
}

async function call(picker: HTMLElement, init?: { body: unknown }): Promise<ListView[]> {
  const tool = picker.dataset.tool!;
  const res = init
    ? await fetch("/api/lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) })
    : await fetch(`/api/lists?tool=${encodeURIComponent(tool)}`);
  const data = (await res.json().catch(() => ({}))) as { lists?: ListView[]; error?: string };
  if (!res.ok || !data.lists) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data.lists;
}

function render(picker: HTMLElement, lists: ListView[]) {
  const ul = picker.querySelector<HTMLElement>("[data-list-items]")!;
  // Rebuilding the rows would drop focus to the page; put it back on the same list's checkbox.
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.listId;
  ul.replaceChildren();
  if (!lists.length) {
    const li = document.createElement("li");
    li.className = "muted small-note";
    li.textContent = "No lists yet. Name your first one below.";
    ul.appendChild(li);
  }
  for (const l of lists) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = l.has;
    box.dataset.listId = l.id;
    const name = document.createElement("span");
    name.className = "list-pop-name";
    name.textContent = l.title;
    const meta = document.createElement("span");
    meta.className = "list-pop-meta";
    meta.textContent = `${l.count} · ${l.public ? "Public" : "Private"}`;
    [box, name, meta].forEach((el) => label.appendChild(el));
    li.appendChild(label);
    ul.appendChild(li);
  }
  if (focused) ul.querySelector<HTMLInputElement>(`input[data-list-id="${CSS.escape(focused)}"]`)?.focus();
  const added = lists.filter((l) => l.has).length;
  const label = picker.querySelector<HTMLElement>("[data-list-toggle] span");
  if (label) label.textContent = added ? `In ${added} ${added === 1 ? "list" : "lists"}` : "Add to list";
}

const say = (picker: HTMLElement, text: string) => (picker.querySelector<HTMLElement>("[data-list-msg]")!.textContent = text);

function setOpen(picker: HTMLElement, open: boolean) {
  const pop = picker.querySelector<HTMLElement>("[data-list-pop]")!;
  const toggle = picker.querySelector<HTMLButtonElement>("[data-list-toggle]")!;
  pop.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  if (!open) return;
  say(picker, "");
  call(picker)
    .then((lists) => {
      render(picker, lists);
      (pop.querySelector<HTMLInputElement>("input[type=checkbox]") ?? pop.querySelector<HTMLInputElement>("input[name=title]"))?.focus();
    })
    .catch((err: Error) => say(picker, err.message));
}

document.addEventListener("click", (e) => {
  const target = e.target as Element;
  const toggle = target.closest<HTMLButtonElement>("[data-list-toggle]");
  document.querySelectorAll<HTMLElement>("[data-list-picker]").forEach((p) => {
    const inside = p.contains(target);
    if (toggle && inside) setOpen(p, toggle.getAttribute("aria-expanded") !== "true");
    else if (!inside && !p.querySelector<HTMLElement>("[data-list-pop]")!.hidden) setOpen(p, false);
  });
});

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Escape") return;
    const picker = [...document.querySelectorAll<HTMLElement>("[data-list-picker]")].find((p) => !p.querySelector<HTMLElement>("[data-list-pop]")!.hidden);
    if (!picker) return;
    e.stopPropagation(); // keeps quick view open
    setOpen(picker, false);
    picker.querySelector<HTMLButtonElement>("[data-list-toggle]")!.focus();
  },
  true,
);

document.addEventListener("change", async (e) => {
  const box = e.target as HTMLInputElement;
  const picker = box.closest<HTMLElement>("[data-list-picker]");
  if (!picker || !box.dataset.listId) return;
  box.disabled = true;
  try {
    render(picker, await call(picker, { body: { action: "toggle", listId: box.dataset.listId, toolId: picker.dataset.tool, on: box.checked } }));
    say(picker, box.checked ? "Added." : "Removed.");
  } catch (err) {
    box.checked = !box.checked;
    box.disabled = false;
    say(picker, (err as Error).message);
  }
});

document.addEventListener("submit", async (e) => {
  const form = (e.target as Element).closest<HTMLFormElement>("[data-list-new]");
  const picker = form?.closest<HTMLElement>("[data-list-picker]");
  if (!form || !picker) return;
  e.preventDefault();
  const input = form.querySelector<HTMLInputElement>("input[name=title]")!;
  if (!input.value.trim()) return input.focus();
  try {
    render(picker, await call(picker, { body: { action: "create", title: input.value, toolId: picker.dataset.tool } }));
    say(picker, `Added to “${input.value.trim()}”.`);
    input.value = "";
  } catch (err) {
    say(picker, (err as Error).message);
  }
});
