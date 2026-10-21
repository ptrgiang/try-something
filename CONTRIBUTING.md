# Contributing to Try Something

## Suggest a tool

Use **Submit a tool** on [trysometh.ing](https://trysometh.ing) (sign-in required). The catalog lives in the database and every listing is reviewed by a person, so tools are never added through GitHub.

A good submission points to the **official** product URL, describes one concrete thing a visitor can do in about 30 seconds, and is honest about whether you made it or found it.

## Contributing code from a fork

We don't run an inbound review queue on this repository: issues and pull requests are closed here. Code contributions come in a different way:

1. **Fork the repo** and open the pull request on _your own_ fork.
2. **Email [hello@trysometh.ing](mailto:hello@trysometh.ing)** with a link to it.
3. We review it, and if we want it, **we merge it on our side** as a single commit that credits you with a `Co-authored-by:` trailer (your GitHub noreply address works).

We read every submission, but we can't promise a reply to each one or a timeline. Bug reports and questions go to the same address. Security reports go through [SECURITY.md](SECURITY.md), never email or public posts.

Your PR is held to the same bar as anything maintainers write. At minimum:

- **Visual evidence for anything a user can see**: before/after screenshots or a short video at 375px and 1440px. A "small" CSS tweak is exactly the kind of change that needs one. PRs that only touch documentation are exempt.
- **QA steps** someone else can follow to verify the change.
- **Test results**: `npm run check`, `npm test`, and `npm run e2e` for UI or flow changes. Add or update tests for behavior changes.
- **What / Why / Before-After / Test results** in the description (see the [PR template](.github/PULL_REQUEST_TEMPLATE.md)), and a self-review comment on your own diff.
- **An AI disclosure** naming the specific model used, or "none", after a `---` separator.

Explain the reasoning, not just the change. For bug fixes, identify the root cause and how the invalid state occurred.

## Ground rules

- **Cloudflare-only infrastructure.** Compute and data stay on Workers, D1, KV and R2. No external databases, auth, email or AI providers without maintainer approval.
- **Never trust user input.** Text is stored as plain text and rendered escaped; never use `set:html` with user content. Outbound fetches of user URLs go through `src/lib/metadata.ts`.
- **Server-side authorization** for every write. Roles are never accepted from the client.
- **No fabricated data.** No fake star counts, votes, traffic or rankings.
- **No third-party media** (screenshots, logos) in the repo without documented permission.
- **No secrets or personal data** in code, commits or PRs. Use `.dev.vars` locally and Worker secrets in production.
- **Migrations are append-only**: add a new numbered file in `migrations/`, never edit an applied one, and keep changes backward compatible (add first, remove in a later release) because migrations run before new code is deployed.

See [AGENTS.md](AGENTS.md) for code conventions that apply to people and coding agents alike.

## License

By sending us a contribution you agree it is licensed under the [MIT License](LICENSE). The Try Something name, logo and domain are covered separately by [TRADEMARK.md](TRADEMARK.md).
