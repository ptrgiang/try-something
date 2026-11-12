// "84 / 120" under [data-max] fields. There is deliberately no maxlength: the browser cut pasted text
// silently, so a long paste now stays whole, the counter turns red and the form won't post until it fits.
// The server refuses over-long text as well (TEXT_LIMITS in lib/validation.ts).
type Limited = HTMLInputElement | HTMLTextAreaElement;

const overBy = (el: Limited) => el.value.length - Number(el.dataset.max);

for (const el of document.querySelectorAll<Limited>("[data-max]")) {
  const max = Number(el.dataset.max);
  const counter = document.createElement("span");
  counter.className = "char-count";
  counter.setAttribute("aria-hidden", "true");
  el.insertAdjacentElement("afterend", counter);
  const update = () => {
    const n = el.value.length;
    const extra = overBy(el);
    counter.textContent = extra > 0 ? `${n} / ${max} · ${extra} over` : `${n} / ${max}`;
    counter.hidden = !n;
    counter.classList.toggle("is-near", extra <= 0 && n >= max * 0.9);
    counter.classList.toggle("is-over", extra > 0);
    el.setCustomValidity(extra > 0 ? `Shorten this by ${extra} character${extra === 1 ? "" : "s"} (limit ${max}).` : "");
    // Only undo the invalid state this script set, never a server error on the same field.
    if (extra > 0) {
      el.dataset.overLimit = "";
      el.setAttribute("aria-invalid", "true");
    } else if (el.dataset.overLimit !== undefined) {
      delete el.dataset.overLimit;
      el.removeAttribute("aria-invalid");
    }
  };
  el.addEventListener("input", update);
  update();
}

// Capture phase, so it runs before a form's own submit handlers. The forms are novalidate, so
// setCustomValidity alone wouldn't stop the post.
document.addEventListener(
  "submit",
  (e) => {
    const form = e.target as HTMLFormElement;
    const first = [...form.querySelectorAll<Limited>("[data-max]")].find((el) => overBy(el) > 0);
    if (!first) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    first.focus();
    first.reportValidity();
  },
  true,
);
