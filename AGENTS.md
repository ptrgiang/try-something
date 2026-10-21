@CONTRIBUTING.md

# Working in this repository

These conventions apply to people and coding agents alike.

## Shape of the code

- Astro SSR on Cloudflare Workers. Bindings come from `import { env } from "cloudflare:workers"`; add new ones to `wrangler.jsonc` (top level **and** `env.staging`) and to `Cloudflare.Env` in `src/env.d.ts`.
- Data access lives in `src/lib/db.ts`. Pages call it; they don't write SQL.
- Outbound requests to user-supplied URLs go only through `safeFetch`/`fetchMetadata`/`fetchImage` in `src/lib/metadata.ts` (SSRF guard).
- Submission status changes go through `src/lib/moderation.ts` transitions and are written with a guarded `UPDATE ... WHERE status = ?` plus an audit row.
- The page CSP blocks inline `style=""` attributes. Use classes in `src/styles/global.css`.

## Comments

Write for a colleague who already knows the codebase: the non-obvious why, ordering constraints, and traps. Don't restate the code or narrate how a bug was found. If a comment runs past about three lines, cut it.

## Before you call something done

- `npm run check`, `npm test`, `npm run build`, and `npm run e2e` for anything a user can see or any flow change.
- Screenshots at 375px and 1440px for visual changes, with no horizontal scroll.
- Never claim "deployed" for something that was only built or run locally.

## Before you commit

- Review what is staged (`git status`, `git diff --cached --stat`), not just what you meant to change.
- Screenshots, logs, exports and scratch scripts stay outside the repo, or in the ignored `.shots/`. Images and other binaries are committed only under `public/` or `docs/assets/`.
- `npm run check:repo` must pass. It blocks unexpected top-level paths, misplaced binaries, files over 256 KB, credential-shaped strings, personal email addresses and account-specific `workers.dev` hosts. CI runs it too.
- Enable the hook once per clone: `git config core.hooksPath .githooks`. Put private terms (names, hosts) in `.git/info/forbidden-words`, one per line; it is never committed.
- A new top-level file or folder means updating the allowlist in `scripts/check-repo.mjs` on purpose, in the same change.

## Never

- Commit secrets, `.dev.vars`, D1 exports or anything under `.wrangler/`.
- Add external services (databases, auth, email, AI, analytics) without maintainer approval.
- Fabricate data: star counts, votes, traffic, rankings, or tools that don't exist.
- Grant roles from the client or skip server-side authorization on a write.
