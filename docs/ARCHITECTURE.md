# Architecture

## ADR-001: Astro SSR on Cloudflare Workers (2026-10-21)

**Context.** Product decision D-021 requires a Cloudflare-first stack: Workers + Static Assets (not Pages Functions), D1, Better Auth, Turnstile, KV only where needed, Email Service on Workers Paid, Workers Builds from GitHub. Earlier prototypes (v0.1 static HTML; v0.2 Pages Functions) were not available in this repository, so the app was built fresh following the approved visual concept.

**Decision.** Astro 7 with `output: "server"` and `@astrojs/cloudflare` 14, deployed as a single Worker with Static Assets.

- Server-rendered HTML for every public page, so tool pages have real titles, canonical URLs and Open Graph tags without client JS.
- Small inline client scripts only where interaction needs it (typewriter, slideshow, save, metadata prefill).
- Forms post back to the page (`Astro.request.method === "POST"`) and work without JS. Astro's `security.checkOrigin` rejects cross-site form posts; JSON endpoints check `Origin` explicitly.
- Bindings via `import { env } from "cloudflare:workers"`.

**Alternatives.** Hono + JSX (lighter, more manual SEO/layout work); React Router on Workers (more client JS than needed).

## Data

D1 is the only source of truth. Main tables (full schema in `migrations/`):

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification`, `rateLimit` | Better Auth core schema; `user.role` ∈ `user`/`moderator`/`admin` (`input:false`, set only by SQL) |
| `tool` | Published catalog. Public queries always filter `status = 'published'`. `canonical_key` unique. |
| `submission` | User submissions. Partial unique index: one open submission per `canonical_key`. |
| `moderation_event` | Append-only history: actor, action, from/to status, reason, time |
| `bookmark` | Saved tools per user |
| `collection`, `collection_tool` | Editor-curated sets |
| `app_rate_limit` | Fixed-window counters for submissions, metadata lookups, bookmarks, comments, likes |
| `comment`, `report`, `notification` | Comments on tools, reports that auto-hide at a threshold until a moderator decides, in-app notifications |
| `tool_like`, `tool_update` | Hearts from accounts; maker product updates, reviewed before they show |
| `tag_info` | Editor-written descriptions for tag pages |
| `*_stat_daily`, `visit_day`, `user_active_day`, `funnel_*_daily` | Cookie-free counters: views, try clicks, impressions, searches, sources and the discovery funnel, one row per day |

### Submission state machine (`src/lib/moderation.ts`)

```
pending ──start_review──▶ in_review
pending / in_review ──approve──▶ published   (creates the tool row in the same D1 batch)
pending / in_review ──request_changes (reason)──▶ needs_changes ──owner edits──▶ pending
pending / in_review / needs_changes ──reject (reason)──▶ rejected
pending / needs_changes ──owner withdraw──▶ withdrawn
tool: published ⇄ hidden (reason required to hide)
```

Moderators can't act on their own submissions (admins can). Every transition is guarded with `WHERE status = <expected>` so concurrent decisions can't both apply; history rows are only inserted when the guarded update applied.

## Security model

- **Auth.** Better Auth sessions in D1, HttpOnly + SameSite=Lax cookies, `Secure` on https. Implicit account linking only when the provider reports a verified email and the local account email is verified. Rate limits on sign-in endpoints.
- **Authorization.** Checked on the server for every write; roles come from the DB only.
- **SSRF** (`src/lib/url.ts`, `src/lib/metadata.ts`): https only, default port, no credentials, no IP literals or internal TLDs; DNS-over-HTTPS resolution must return only public addresses; redirects are manual (max 3) and each hop is re-validated; 5s total timeout; HTML only; body read capped at 512 KB and stopped at `</head>`. Metadata is only a suggestion and shown to moderators as untrusted.
- **XSS.** User text is stored as plain text (control/bidi characters stripped) and always rendered through Astro's escaping. No `set:html` with user data. JSON-LD is serialized with `<` escaped.
- **CSP.** Astro-generated CSP with hashes for scripts and styles; `frame-ancestors` equivalent via `X-Frame-Options: DENY`; external scripts limited to Turnstile.
- **Bots/spam.** Turnstile verified server-side (action + hostname checked, fails closed) on submit and on the email-OTP send endpoint; per-user rate limits.
- **Privacy.** Admin/me/submit/login/api responses are `noindex` and `private, no-store`. Non-production hosts serve `Disallow: /`.

## Caching

- GitHub stars: KV key `gh-stars:<repo>`, fresh for 30 min, stale fallback up to 7 days, otherwise hidden — never a made-up number.
- Static assets under `/_astro/*` are immutable-cached by the adapter.

## Since the first release

Comments, reports, profiles, maker verification, cover uploads (R2, resized with the Images binding) and cookie-free analytics in D1 are built; see `ROADMAP.md` and `CHANGELOG.md`. Not built on purpose: Queues and Cron (nothing needs background work yet) and any third-party analytics or ranking.
