// [data-share="/path"] buttons: the system share sheet where there is one, otherwise copy the link.
document.addEventListener("click", async (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>("[data-share]");
  if (!btn) return;
  const url = new URL(btn.dataset.share!, location.origin).href;
  const title = btn.dataset.shareTitle ?? document.title;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    await navigator.share({ title, url }).catch(() => {});
    return;
  }
  const label = btn.querySelector("span");
  const before = label?.textContent ?? null;
  try {
    await navigator.clipboard.writeText(url);
    btn.setAttribute("data-copied", "");
    if (label) label.textContent = "Link copied";
    btn.setAttribute("aria-label", "Link copied");
  } catch {
    window.prompt("Copy this link", url);
    return;
  }
  setTimeout(() => {
    btn.removeAttribute("data-copied");
    if (label && before !== null) label.textContent = before;
    btn.setAttribute("aria-label", `Share ${title}`);
  }, 2000);
});
