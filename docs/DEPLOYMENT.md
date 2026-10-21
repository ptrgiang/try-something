# Deployment (Cloudflare Workers)

Production was first deployed by hand with wrangler (resources, migrations, seed, Worker); Workers Builds isn't connected yet, so until it is, deploy with `npm run build && npx wrangler deploy`. Steps marked **Owner** need account access that only the project owner has.

## Pipeline

```
Pull request / branch  → GitHub Actions: type-check, unit, build, e2e, migration guard
                       → Workers Builds (staging Worker): preview version URL, staging D1/KV
Push to main           → Workers Builds: migrate staging D1, deploy try-something-staging
Promote (manual)       → "Promote to production" workflow fast-forwards `release`
                       → Workers Builds (production Worker): migrate production D1, deploy try-something
```

- GitHub Actions only tests. It never holds a Cloudflare API token; deploys happen in Cloudflare Workers Builds.
- Staging has its own Worker, D1 and KV (`env.staging` in `wrangler.jsonc`), so previews never write to production data. Bindings in `env.staging` are **not** inherited from the top level; keep both in sync.
- Migrations run before the new code goes live, so every migration must be backward compatible with the code already running (add columns/tables first; drop them in a later release).

## 1. Create resources (Owner, once)

```bash
npx wrangler d1 create try-something-db                # production → top-level database_id
npx wrangler d1 create try-something-db-staging        # staging    → env.staging database_id
npx wrangler kv namespace create CACHE                 # production → top-level kv id
npx wrangler kv namespace create CACHE --env staging   # staging    → env.staging kv id
npx wrangler r2 bucket create try-something-avatars          # production profile photos (private bucket)
npx wrangler r2 bucket create try-something-avatars-staging  # staging
npx wrangler r2 bucket create try-something-tool-images          # production tool covers uploaded with submissions (private bucket)
npx wrangler r2 bucket create try-something-tool-images-staging  # staging
```

Commit the IDs to `wrangler.jsonc`. They are not secrets: using them still requires Cloudflare account access.

Covers served from `/media` are shrunk to 960px WebP through the `IMAGES` binding (Cloudflare Images transformations, no setup beyond the binding). The result is kept in the `TOOL_IMAGES` bucket at `cover/<toolId>.webp` and rebuilt only when the source changes or after 90 days (`COVER_REFRESH_MS`), so Images runs about once per tool per quarter however much traffic there is. Without the binding the original image is stored unchanged.

Share cards (`/og/<kind>/<id>.png`) are drawn on the Worker with satori and resvg (about 2 MB gzip of the bundle, so the Workers Paid size limit) and kept in the same bucket under `og/`. A card is redrawn only when its content hash changes, which costs one Images transform per cover on it.

Seed data (`db/seed.sql`) is editorial content. Load it into staging freely; load it into production only after an editor has checked each tool's link and 30-second try:

```bash
npx wrangler d1 execute DB --remote --env staging --file=./db/seed.sql
npx wrangler d1 execute DB --remote --file=./db/seed.sql
```

## 2. Secrets (Owner)

Set per environment with `wrangler secret put <NAME>` (add `--env staging` for staging) or in the dashboard (Workers → Settings → Variables and Secrets). Never put them in the repo, issues, PRs or the project sheet.

| Name | Notes |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`; different per environment |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | One GitHub OAuth App per environment; callback `<site>/api/auth/callback/github` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client (Web); redirect `<site>/api/auth/callback/google` |
| `TURNSTILE_SECRET_KEY` | Real Turnstile widget covering `trysometh.ing` and the staging host |
| `GITHUB_TOKEN` | Optional, no scopes; raises the GitHub API rate limit for the star counter |

Public vars live in `wrangler.jsonc` (`PUBLIC_SITE_URL`, `PUBLIC_GITHUB_REPO`, `TURNSTILE_SITE_KEY`, `EMAIL_LOGIN_ENABLED`, `COMMENTS_ENABLED`). Replace the always-pass Turnstile test site key and secret before launch. On staging, set `PUBLIC_SITE_URL` with `wrangler secret put PUBLIC_SITE_URL --env staging` instead (the exact `https://try-something-staging.<account-subdomain>.workers.dev` URL from the first deploy), so the account subdomain stays out of the repo.

### GitHub and Google sign-in

Create one app per environment (local, staging, production); each provider allows only exact callback URLs. The buttons appear on `/login` as soon as both the ID and secret for a provider are set.

**GitHub**: github.com → Settings → Developer settings → OAuth Apps → New OAuth App.

- Homepage URL: the site URL (`https://trysometh.ing`, the staging host, or `http://localhost:4321`)
- Authorization callback URL: `<site>/api/auth/callback/github`
- Generate a client secret and copy it straight into `wrangler secret put GITHUB_CLIENT_SECRET` (or `.dev.vars` locally).

**Google**: Google Cloud console → APIs & Services.

- OAuth consent screen: app name "Try Something", support email `hello@trysometh.ing`, scopes `openid`, `email`, `profile` only, links to `/privacy` and `/terms`. Publish it, or only test users can sign in.
- Credentials → Create credentials → OAuth client ID → Web application.
- Authorized JavaScript origin: the site URL. Authorized redirect URI: `<site>/api/auth/callback/google`.

Check both buttons end to end on staging before production; a wrong callback shows up only after the provider redirects back.

## 3. Workers Builds (Owner authorizes, then automatic)

Connect the GitHub repository to **two** Workers in the dashboard (Workers & Pages → Worker → Settings → Builds).

**try-something-staging**

- Production branch: `main`
- Build command: `npm ci && CLOUDFLARE_ENV=staging npm run build`
- Deploy command: `npx wrangler d1 migrations apply DB --remote --env staging && npx wrangler deploy`
- Non-production branch builds: on. Deploy command: `npx wrangler versions upload` (preview URL per branch, staging bindings)

**try-something** (production)

- Production branch: `release`
- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`
- Non-production branch builds: **off** (they would bind to production data)

`CLOUDFLARE_ENV` selects the environment at build time; the Astro adapter writes a flattened config to `dist/server/wrangler.json`, which `wrangler deploy` picks up automatically.

## 4. Releasing to production

1. Check staging (the `main` deployment) works.
2. Back up production D1 if the release contains a migration:
   `npx wrangler d1 export DB --remote --output backup-$(date +%F).sql` (keep it outside the repo; `*.sql` backups are gitignored under `backups/`).
3. Run the **Promote to production** workflow in GitHub Actions. It requires approval in the `production` environment and fast-forwards `release` to the chosen `main` commit; Workers Builds then deploys it.

Rollback: see [runbooks/rollback.md](runbooks/rollback.md).

## 5. Repository settings (Owner)

- Issues off, Discussions off (contributions come by email, see CONTRIBUTING.md); private vulnerability reporting on.
- Branch rulesets: `main` requires the CI check and linear history, no force pushes or deletions. `release` allows updates only from the promote workflow (no force pushes).
- Environment `production` with the owner as required reviewer.
- Secret scanning and push protection on; Dependabot alerts and security updates on.

## 6. Security gate before any public deploy (Owner)

The code is public, so production must not rely on anything being secret except Worker secrets. Check each item; the app refuses to start or fails closed where noted.

- [ ] `BETTER_AUTH_SECRET` set, 32+ random characters, different per environment (the app throws on https without it).
- [ ] Real Turnstile widget and secret for each environment. Cloudflare's test keys are ignored on https: submissions and email sign-in stay disabled until a real secret is set.
- [ ] OAuth apps per environment with exact callback URLs; secrets only in Worker secrets.
- [ ] No `.dev.vars`, D1 export or backup in the repository (`git ls-files`), and GitHub secret scanning with push protection on.
- [ ] WAF rate-limiting rule (one is included on the Free plan): e.g. path starts with `/api/` or `/submit`, more than 60 requests per 10 seconds per IP → block for 10 seconds. Bot Fight Mode on.
- [ ] First admin promoted by SQL; any other moderators added from `/admin/users` (each change is in the audit log).
- [ ] Comments: `COMMENTS_ENABLED` is `"false"` in production until an editor has run the comment, report and hide flow on staging (see docs/runbooks/moderation.md). Then set it to `"true"` and deploy.
- [ ] `npm audit` clean; Dependabot alerts on.

Known, accepted limits:

- Trending and Popular share one score (view 1, try 3, heart 5, account save 5; Trending counts the last 7 days, Popular all time). Views and tries can be nudged by someone with many IP addresses (each IPv4 address or IPv6 /64 counts once per tool per day); hearts and saves need accounts. The score itself is never shown, only the view, heart and save totals, and editors can hide a tool.
- D1-backed rate limits stop single clients, not floods from many addresses; the WAF rule above is the defense for that.
- Comments: 6 per 10 minutes and 40 per day per account, plain text only, links not clickable. Three distinct reports hide a comment until a moderator decides. New accounts are not otherwise restricted; watch the Reports tab in the first weeks.
- Maker verification fetches the listed page and `/.well-known/trysometh.ing.txt` through the same SSRF guard as metadata, at most 10 checks per user per hour.

## 7. Custom domain (Owner approves)

`trysometh.ing` and `www.trysometh.ing` are Workers Custom Domains declared in `wrangler.jsonc` (`routes`), so `wrangler deploy` attaches them and TLS is issued automatically. The middleware redirects `www` to the apex with a 301. Production has `workers_dev` off, so the site has one public address; staging keeps its workers.dev host.

The contact address `hello@trysometh.ing` (CONTRIBUTING.md, TRADEMARK.md, Terms) uses Cloudflare Email Routing: a literal rule forwards it to the owner's verified inbox, and the catch-all drops everything else. Routing only receives mail. Replying as "Try Something <hello@trysometh.ing>" needs a sending service: Cloudflare Email Service (Workers Paid, same as email OTP), so replies come from the owner's own address until then.

## 8. Email (Workers Paid, set up)

- **Receiving**: Email Routing forwards `hello@trysometh.ing` to the owner's verified inbox; the catch-all drops everything else.
- **Sending**: Email Service is enabled for `trysometh.ing` (DKIM selector `cf-bounce`, return path `cf-bounce.trysometh.ing`, DMARC `p=reject`). The `EMAIL` binding may only send from `hello@trysometh.ing`, shown as "Try Something". A test message was delivered on 2026-10-21.
- **Sign-in codes**: `EMAIL_LOGIN_ENABLED=true` in `wrangler.jsonc`, but the email option stays hidden on https until a real Turnstile secret is set, because the captcha is what keeps the mailer from being abused. After deploying, test a code to an unrelated external mailbox (expiry, single use, rate limit).
- Manual mail as Try Something: `npx wrangler email sending send --from hello@trysometh.ing --from-name "Try Something" --to <address> --subject ... --text ...`.

## 9. First admin

After the owner signs in once (later moderators and admins are managed at `/admin/users`):

```bash
npx wrangler d1 execute DB --remote --command "UPDATE \"user\" SET role = 'admin' WHERE email = '<owner email>'"
```

## Cost notes (Workers Free vs Paid, check current pricing)

- Workers Free: 100k requests/day, 10 ms CPU per request — enough for staging and early traffic; SSR pages use a few ms.
- D1 Free: 5 GB storage, 5M rows read/day. KV Free: 100k reads/day. A second (staging) D1 and KV fit within the free tier.
- Workers Paid ($5/month minimum) is needed for Email Service sending to arbitrary addresses; check the current Email Service pricing page before enabling.
