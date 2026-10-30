<p align="center">
  <picture>
    <source srcset="docs/assets/logo-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset="docs/assets/logo.png" media="(prefers-color-scheme: light)">
    <img src="docs/assets/logo.png" width="420" alt="Try Something logo">
  </picture>
</p>

<p align="center">
  <strong>Find something worth trying.</strong>
</p>

<p align="center">
  <a href="https://trysometh.ing">Try Something</a> is an open-source, human-reviewed collection of web tools, toys and tiny apps you can try in about 30 seconds. This repository contains the source code for the whole site.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-17141f?style=for-the-badge" alt="MIT License"></a>
  <a href="https://developers.cloudflare.com/workers/"><img src="https://img.shields.io/badge/runs_on-Cloudflare_Workers-ff6a45?style=for-the-badge" alt="Runs on Cloudflare Workers"></a>
</p>

## Contributing

We don't run an inbound review queue on this repo. To contribute a change: **fork the repo, open the pull request on your own fork, then email [hello@trysometh.ing](mailto:hello@trysometh.ing) with a link to it.** We read every submission and merge the ones we want on our side, crediting you as co-author, though we can't promise a reply to each one or a timeline.

Your PR still has to meet the same bar as our own work: visual evidence for anything user-facing, QA steps, test results, and an AI disclosure naming the model. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guidelines.

Questions, bug reports and ideas go to [Discussions](https://github.com/ptrgiang/try-something/discussions).

Want a tool listed? Use **Submit a tool** on the site; the catalog isn't edited through GitHub.

## Table of Contents

- [Contributing](#contributing)
- [What it does](#what-it-does)
- [Stack](#stack)
- [Technical decisions](#technical-decisions)
- [Getting Started](#getting-started)
  - [Making yourself a moderator locally](#making-yourself-a-moderator-locally)
- [Testing](#testing)
- [Project docs](#project-docs)
- [License and trademarks](#license-and-trademarks)

## What it does

- Visitors explore, search, hit **Surprise me** and open the real product on its official site, all without signing in.
- Anyone signed in can submit a tool, whether they **made it** or **found it**.
- Every submission is reviewed by a person before it is published, with an audit trail of each decision.
- Makers can prove a listing is theirs (a meta tag or a `/.well-known` file), claim editorial listings of their own tools, post product updates and embed a "Listed on Try Something" badge.
- People can comment, report and keep a public profile. Moderators handle reports, comments, collections, roles and cookie-free site stats from one admin area.
- No ads, no pay-to-rank, no fake popularity numbers: hearts, views and saves are real counts.

## Stack

Everything runs on Cloudflare:

| Layer | Choice |
| --- | --- |
| App (SSR + API) | [Astro](https://astro.build) 7 on Cloudflare Workers + Static Assets (`@astrojs/cloudflare`) |
| Database | Cloudflare D1 (SQL migrations in `migrations/`) |
| Auth | [Better Auth](https://better-auth.com) on D1 — GitHub, Google, email OTP |
| Bot protection | Cloudflare Turnstile (verified server-side) |
| Cache | Workers KV (GitHub star count) |
| Email | Cloudflare Email Service `send_email` binding: sign-in codes from "Try Something <hello@trysometh.ing>" |
| CI/CD | GitHub Actions for checks; deploys with `wrangler` (Cloudflare Workers Builds planned) |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for decisions and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for deployment.

## Technical decisions

- **Server-rendered pages on one Worker.** Astro SSR on Cloudflare Workers with D1 keeps every page crawlable with real titles and Open Graph tags, ships little client JavaScript, and puts compute and data in one place with no separate API server.
- **Fetching user-supplied URLs safely.** Metadata lookups go through one SSRF guard (`src/lib/metadata.ts`): https only, DNS resolved over HTTPS and checked for private addresses, every redirect re-validated, a short timeout and a byte cap. Share images are proxied through our own domain, never hot-linked.
- **People review every listing.** A submission is a claim ("you can try this in 30 seconds"), and only a person can check it. Status changes follow a small state machine with guarded updates and an audit row, and moderators can't approve their own submissions (only admins can).
- **Picks balance new and unseen.** The default order puts editors' picks first, then tools from the last two weeks, then the rest with the least-seen first and a daily shuffle (`src/lib/picks.ts`), so the same few tools don't sit on top forever.
- **Only real numbers.** Views, tries, hearts and saves are counted once per visitor per day, without cookies, and shown as they are. No paid ranking, no seeded votes, and the GitHub star count is hidden rather than guessed when it can't be fetched.

## Getting Started

Requirements: Node.js 22+ and npm.

```bash
npm install
cp .dev.vars.example .dev.vars        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate:local              # create the local D1 schema
npm run db:seed:local                 # load the editorial seed tools
npm run preview                       # build + wrangler dev (real Workers runtime, local D1/KV)
git config core.hooksPath .githooks   # pre-commit guard against stray files and leaked secrets
```

`npm run dev` runs Astro's dev server with the Cloudflare runtime as well.

OAuth buttons only appear when the matching `*_CLIENT_ID`/`*_CLIENT_SECRET` are set in `.dev.vars`. For local OAuth, register callback URLs like `http://localhost:4321/api/auth/callback/github` and set `PUBLIC_SITE_URL` accordingly (see `wrangler.jsonc` `vars`).

### Making yourself a moderator locally

Roles are never assignable from the browser. After signing in once:

```bash
npx wrangler d1 execute DB --local --command "UPDATE \"user\" SET role = 'admin' WHERE email = 'you@example.com'"
```

## Testing

```bash
npm test          # unit tests (URL safety/SSRF, metadata parsing, validation, moderation rules, Turnstile, stars cache)
npm run e2e       # Playwright: discover → submit → review → publish, plus comments, reports, roles, collections, account deletion
npm run check     # type-check
```

E2E tests create throwaway users/sessions in the **local** D1 database only and sign the cookie with your local secret.

## Project docs

- [ARCHITECTURE.md](docs/ARCHITECTURE.md): decisions and data model
- [DEPLOYMENT.md](docs/DEPLOYMENT.md): staging, production and secrets
- [Runbooks](docs/runbooks/): moderation, takedown, rollback
- [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md)
- [AGENTS.md](AGENTS.md): code conventions for people and coding agents
- [Code of Conduct](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md) (report vulnerabilities privately)

## License and trademarks

The source code is released under the [MIT License](LICENSE).

The MIT license covers the code only. It does **not** grant rights to:

- the **Try Something** name, the `trysometh.ing` domain, and the logo;
- content submitted by users (submitters grant Try Something permission to display it);
- third-party product names, marks, screenshots or other media of listed tools, which belong to their owners.

Tool images are each product's own share image (og:image), proxied through our domain (shrunk with Cloudflare Images) and shown with credit; makers can ask for removal (see [docs/runbooks/takedown.md](docs/runbooks/takedown.md)). When there is none, the site shows original cover art generated by `src/components/CoverArt.astro`. Full policy: [TRADEMARK.md](TRADEMARK.md).
