// Named Ship Track events (names only, never ids or personal data). t.js is deferred, left out for staff
// and may be blocked, so this waits for the page to load and does nothing when it isn't there.
type ShipWindow = Window & { ship?: { track(name: string): void } };

export function shipTrack(name: "signup" | "try_clicked" | "tool_submitted"): void {
  const run = () => (window as ShipWindow).ship?.track(name);
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}

/** Marks a post-sign-in destination so the first page after creating an account counts one "signup". */
export const SIGNUP_PARAM = "welcome";

export function withSignupMark(path: string): string {
  const u = new URL(path, location.origin);
  u.searchParams.set(SIGNUP_PARAM, "1");
  return u.pathname + u.search + u.hash;
}
