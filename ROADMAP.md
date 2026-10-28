# Roadmap

Status as of 2026-10-22. Nothing here is a launch promise.

The current interface is **design v1**, locked on 2026-10-22: editorial cream/coral/lavender/butter look,
Gallery-style cards with hover actions and quick view, brand logo, cursor and scrollbar. Later changes build on it
rather than replacing it.

## M0 — Public OSS + core launch

- [x] Workers + Static Assets SSR app (Astro), D1 schema and migrations
- [x] UI based on the selected editorial concept (desktop/tablet/mobile), design v1 locked
- [x] Explore, search with result count, categories, infinite scroll, Surprise me, Save (local + account sync)
- [x] Home list filters in place (category, New/Trending/Popular) with skeleton loading
- [x] Tool detail pages and quick view, with canonical URL, Open Graph, JSON-LD and sitemap
- [x] Hearts (signed-in, one per account), de-duplicated views, save counts; one shared score for Trending (7 days) and Popular (past month, past year or all time)
- [x] Quick search (Ctrl+K), comments drawer and Share in the quick view, profile tabs (Saved/Hearted owner-only), Top today with day badges, editor-written tag intros
- [x] Discovery: tag pages with related tags, tag filter on Explore, "More from this maker" and "You might also like" on tool pages, quick view with a sticky action bar and ←/→ browsing
- [x] URL-first submission for makers and discoverers, SSRF-safe metadata suggestions, duplicate detection
- [x] Review dashboard: pending → in review → needs changes / published / rejected, hide published tools, audit history
- [x] GitHub/Google OAuth with Better Auth on D1, server-side roles
- [x] Turnstile on submissions, rate limits
- [x] GitHub header link with real, cached star count (hidden when unknown)
- [x] Email OTP sign-in wired to Cloudflare Email Service (sending domain verified; live once a real Turnstile secret is set)
- [x] Repo policy: MIT + trademark policy, fork-and-email contributions, AGENTS.md, runbooks
- [x] CI (type-check, unit, build, e2e, migration guard); staging environment; manual promote-to-production workflow
- [x] `hello@trysometh.ing` via Cloudflare Email Routing (contact for contributions and takedowns)
- [x] Public repository with branch rulesets (2026-10-27)
- [ ] Workers Builds connected (staging + production); until then deploys run by hand with wrangler
- [x] Production D1/KV, Worker secrets, OAuth apps, real Turnstile keys, WAF rate-limit rule
- [x] Staging preview, then production on `trysometh.ing` after QA (OAuth callbacks checked on both)
- [x] Visual QA at 768px alongside 375px and 1440px (staging, 2026-10-22)
- [x] Browser check of every seed tool's 30-second try (2026-10-22; listening and feel still need an editor)
- [x] Seed set grown to 29 tools across all seven categories of the time (nine since Utilities and Business were added), each opened in a browser and usable without an account

## M1 — Community

- [x] Public profiles at `/users/:handle` (only once a handle is chosen) with made/found credit
- [x] Maker verification: meta tag or `/.well-known` file with a per-account token, checked through the SSRF guard
- [x] Comments with one level of replies; authors edit and delete their own; plain text, links not clickable
- [x] Report a tool or a comment; 3 reports hide a comment until a moderator decides
- [x] Moderator screens for reports and comments, with reasons in the audit trail
- [x] Admin screens for collections (draft → published, ordering) and featured tools
- [x] Role management for admins (never self-service, audited)
- [x] Self-serve account deletion
- [x] One account per person across Google, GitHub and email codes; Settings (`/me/settings`) for profile, sign-in methods and deletion
- [x] Profile photos: upload (resized in the browser, checked on the server, stored in R2), or the Google/GitHub photo, or initials; moderators can remove one
- [x] `COMMENTS_ENABLED` switch, off in production until checked on staging
- [x] Comments on in production (2026-10-27)
- [ ] Weekly curated collections as an editorial habit (the tooling exists)
- [x] Optional cover upload with a submission: resized in the browser, checked on the server, private in R2 until a moderator publishes it; covers use the upload, then the site's share image, then generated art
- [x] Production R2 bucket for tool covers (`try-something-tool-images`)
- [x] Privacy-friendly analytics on our own D1 (no cookies, no third party): `/admin/stats` with traffic, sources, countries, top tools, community activity and weekly account retention

- [x] Search-friendly pages: site-wide JSON-LD graph (WebSite with search, Organization), breadcrumbs, CollectionPage lists on tag, category and collection pages, ProfilePage on profiles; intent titles; sitemap index with tool cover images; categories at `/explore/<category>`
- [x] Search terms in `/admin/stats` (normalized, once per visitor per day, 180-day retention), with terms that find nothing highlighted

## M1.5 — Coming back

Reasons for people to return, built on what M1 already stores. In order:

- [x] **R1 Notifications in the site**: a bell for your submission's status changes, replies to your comments and new
      comments on tools you listed. Stored in D1, read state per account, no email.
- [ ] **R1b Saved-tool updates**: tell people when a tool they saved changes, once published listings can be edited.
- [ ] **R2 Follow makers and finders**: follow a profile from it or from a tool page; a "Following" tab on Explore with
      their new tools. Follower counts shown only once moderation and rate limits cover it.
- [ ] **R3 Your own collections**: save tools into named lists, private by default; public lists get their own page,
      indexable once they hold a few tools.
- [ ] **R4 Email notifications and a weekly digest**: opt-in per type, one-click unsubscribe in every email. Needs
      maintainer approval to send through Cloudflare Email Service beyond sign-in codes.
- [ ] **R5 Weekly challenge**: one prompt a week ("find a tool that makes music in 30 seconds"), with submissions
      reviewed as usual and the picks shown on the home page.

## M1.6 — Growth loop & discovery

Discover → Try → Share. A curious person finds something worth trying, a maker gets real attention, and both have a
reason to come back. North star: **weekly explorers who click through to try at least one tool** (an outbound click is
a proxy for trying, not proof). No paid placement, points, badges, streaks or invented numbers.

Audit (2026-10-23):

- Already there: editor-ordered featured tools (`tool.featured`, `/admin/tools`) in the hero slideshow; collections with
  draft → published and ordering (`/admin/collections`); search, categories, New/Trending/Popular; Surprise me;
  account saves plus local saves; submission → review → publish with made/found credit and audit trail; per-tool daily
  views and tries, saves and hearts; site page views, sources, search terms and weekly account retention.
- Needs work: the hero's featured tool repeats in the first row of the grid; the hero always opens on the same pick;
  nothing between search and the full grid says "start here"; Submit is hard to find when signed out on desktop;
  Surprise me can repeat and ignores how much exposure a tool already had; cards show rows of zeros.
- Missing: which surface (hero, picks, grid, search, collection, related) led to a try; card impressions; unique
  explorers who tried something; makers can't see numbers for their own listings.

P0:

- [x] Hero opens on a different featured pick each UTC day (same all day for everyone); hero picks never repeat in the
      home grid's first rows
- [x] "Worth trying" picks on the home page from the newest published collection, with its title and date (editors
      refresh it by publishing a collection; no code change)
- [x] "Share a find" link in the hero, next to "Made it or found it?"
- [x] Discovery analytics: impressions (seen on screen, once per tool per surface per visit), views and tries tagged
      with their surface; daily unique explorers who tried a tool; `/admin/stats` shows surfaces, tools seen but rarely
      tried, collection views and submissions created/approved

P1:

- [x] Surprise me skips tools already shown in this visit and leans toward tools with less exposure
- [x] Makers and finders see views, tries, saves and hearts for their own listed tools in My submissions
- [x] Cards hide zero counts (the heart stays clickable); private numbers stay exact
- [x] A first collection for the home picks on staging: "Tiny tools that are surprisingly useful" (2026-10-23); production
      needs its own once it launches
- [x] Product updates from makers through moderation: the maker who listed a tool posts what changed and refreshed
      listing text (one waiting at a time, 3 per 30 days); a moderator approves or declines in `/admin/updates`, and
      may resurface a meaningful update so it ranks with new tools in Picks for 14 days, at most once per 90 days
- [x] Default "Picks" sort: featured in editors' order, then tools new or resurfaced in the last 14 days, then the rest
      with less-seen tools first and a daily reshuffle (`src/lib/picks.ts`, tune the constants once impressions data
      shows how it does)
- [ ] Notify people who saved a tool when it gets an update (R1b; the notification kinds need a table rebuild)

## M2 — Growth (only with a real audience)

- Public contribution program
- Better collections, discovery and recommendation quality
- Clearly labeled sponsored placements — never selling rank, reviews or votes
