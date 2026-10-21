## What

<!-- What does this change? -->

## Why

<!-- The problem being solved. For bug fixes: the root cause and how the invalid state occurred. -->

## Before / After

<!-- Required for anything a user can see: screenshots or a short video at 375px and 1440px. Docs-only PRs may skip. -->

## QA steps

1.

## Test results

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run e2e` (UI or flow changes)

## Checklist

- [ ] Server-side authorization for any new write path
- [ ] User input rendered escaped (no `set:html` with user data)
- [ ] Schema changes are a new, backward-compatible file in `migrations/`
- [ ] No secrets, personal data or unlicensed third-party media
- [ ] Stays on Cloudflare (no new external services without approval)

---

AI disclosure: <!-- model(s) used, e.g. "Claude Opus 5.5", or "none" -->
