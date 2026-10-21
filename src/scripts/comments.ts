// Comment threads (Comments.astro). Loaded on tool pages and by the quick view, so every lookup
// starts from the [data-comments] section the event came from: a list page can hold one in the dialog.
import { askConfirm, fetchDocument } from "./client";

const MAX = 1000;
const api = async (method: string, body: unknown) => {
  const res = await fetch("/api/comments", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) throw new Error(out.error || "Something went wrong. Please try again.");
  return out;
};
const showError = (root: HTMLElement, msg: string) => {
  const box = root.querySelector<HTMLElement>("[data-comment-error]");
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
};

// Re-renders the section from the server so counts, badges and placeholders stay exact.
async function refresh(current: HTMLElement, focusId?: string) {
  const doc = await fetchDocument(`/tools/${current.dataset.slug}`);
  const fresh = doc.querySelector("[data-comments]");
  if (!fresh) return;
  const next = document.importNode(fresh, true) as HTMLElement;
  current.replaceWith(next);
  document.dispatchEvent(new CustomEvent("ts:comments", { detail: next }));
  if (focusId) {
    const el = next.querySelector<HTMLElement>(`#c-${CSS.escape(focusId)}`);
    el?.classList.add("is-new");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function composer(placeholder: string, value = "", submitLabel = "Post") {
  const form = document.createElement("form");
  form.className = "comment-form comment-form-inline";
  const area = document.createElement("textarea");
  area.name = "body";
  area.rows = 3;
  area.maxLength = MAX;
  area.required = true;
  area.placeholder = placeholder;
  area.value = value;
  area.setAttribute("aria-label", placeholder);
  const foot = document.createElement("div");
  foot.className = "comment-form-foot";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-sm";
  cancel.textContent = "Cancel";
  cancel.dataset.cancel = "";
  const ok = document.createElement("button");
  ok.type = "submit";
  ok.className = "btn btn-sm btn-dark";
  ok.textContent = submitLabel;
  foot.appendChild(cancel);
  foot.appendChild(ok);
  form.appendChild(area);
  form.appendChild(foot);
  return form;
}

async function submit(form: HTMLFormElement, root: HTMLElement, run: (body: string) => Promise<string | undefined>) {
  const area = form.querySelector("textarea")!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  if (area.value.trim().length < 2) {
    showError(root, "Write a little more.");
    area.focus();
    return;
  }
  button.disabled = true;
  try {
    const id = await run(area.value);
    await refresh(root, id);
  } catch (err) {
    showError(root, err instanceof Error ? err.message : "Something went wrong.");
    button.disabled = false;
  }
}

document.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  const root = form.closest<HTMLElement>("[data-comments]");
  if (!root) return;
  e.preventDefault();
  const toolId = root.dataset.tool!;
  if (form.matches("[data-comment-form]")) {
    submit(form, root, async (body) => (await api("POST", { toolId, body })).id);
  } else if (form.dataset.replyTo) {
    submit(form, root, async (body) => (await api("POST", { toolId, parentId: form.dataset.replyTo, body })).id);
  } else if (form.dataset.editOf) {
    const id = form.dataset.editOf;
    submit(form, root, async (body) => {
      await api("PATCH", { id, body });
      return id;
    });
  }
});

document.addEventListener("click", async (e) => {
  const el = e.target as Element;
  const root = el.closest<HTMLElement>("[data-comments]");
  if (!root) return;
  const comment = el.closest<HTMLElement>("[data-comment]");

  if (el.closest("[data-cancel]")) {
    const form = el.closest<HTMLFormElement>("form")!;
    if (form.dataset.editOf) form.previousElementSibling?.removeAttribute("hidden");
    form.remove();
    return;
  }
  if (el.closest("[data-reply]") && comment) {
    const slot = root.querySelector<HTMLElement>(`[data-reply-slot="${comment.dataset.comment}"]`);
    if (!slot || slot.querySelector("form")) return slot?.querySelector("textarea")?.focus();
    const author = comment.querySelector(".comment-author")?.textContent ?? "";
    const form = composer(`Reply to ${author}`, "", "Reply");
    form.dataset.replyTo = comment.dataset.comment!;
    slot.appendChild(form);
    form.querySelector("textarea")!.focus();
    return;
  }
  if (el.closest("[data-edit]") && comment) {
    const body = comment.querySelector<HTMLElement>("[data-body]")!;
    if (body.hidden) return;
    const form = composer("Edit your comment", body.textContent ?? "", "Save");
    form.dataset.editOf = comment.dataset.comment!;
    body.hidden = true;
    body.insertAdjacentElement("afterend", form);
    const area = form.querySelector("textarea")!;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    return;
  }
  if (el.closest("[data-delete]") && comment) {
    if (!(await askConfirm({ title: "Delete this comment?", body: "This can't be undone. Replies from others stay.", confirm: "Delete", danger: true }))) return;
    try {
      await api("DELETE", { id: comment.dataset.comment });
      await refresh(root);
    } catch (err) {
      showError(root, err instanceof Error ? err.message : "Couldn't delete it.");
    }
  }
});

// Ctrl/Cmd+Enter posts from any comment box.
document.addEventListener("keydown", (e) => {
  const area = e.target as HTMLElement;
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && area.matches("[data-comments] textarea")) {
    e.preventDefault();
    area.closest("form")?.requestSubmit();
  }
});
