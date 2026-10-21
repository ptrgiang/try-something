# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Browsing and profiles

- Quick search from any page: Ctrl+K (⌘K on a Mac) or "/" opens a search box with live results, arrow-key selection and a link to all results. With an empty query it shows what's trending this week.
- The quick view opens the tool page itself over the list, comments column included, so you can post, reply, edit and delete without leaving it; Previous/Next or ←/→ step through the list. Tool pages have a Share button that uses the system share sheet on phones and copies the link elsewhere.
- Tool pages read top to bottom in one column (name, cover, "Try this in 30 seconds", actions, why, credits). When comments are on, they sit in a column on the right that stays in view while you scroll; on phones they follow the details.
- Profile headers are centered: a large photo over a soft band, the name in big type, bio, website and join date, then one row of real counts (made, found, and the hearts and saves those tools got).
- Profiles have tabs: Made and Found for everyone, plus Saved and Hearted that only the owner sees.
- "Top today" on the home page ranks today's (UTC) most active tools by the same score as Trending, and appears only once at least three tools pass a minimum of real activity. A tool that was first on a finished day shows a "Top tool of the day" badge for the last 90 days.
- Two new categories, Utilities (convert, compress, share and fix files) and Business (invoices, pitches, branding, numbers); Productivity now means timers, notes and to-dos.
- 19 more seed tools so every category has picks, including the first Utilities and Business ones; PairDrop, Wormhole and Squoosh moved from Productivity to Utilities.
- Stats audit: a visitor-day discovery funnel (visited → engaged → clicked Try) with step conversion and drop-off, by place and by acquisition source (`utm_source`, `utm_medium`, `utm_campaign`, or referrer; unknown stays "Direct or unknown"). Try clicks not credited to a place show as "Unattributed". Rates under 30 show as "too few". Tiles say visitor-days instead of implying distinct people. The try ÷ view rate is gone. A note marks non-production data.
- Analytics no longer count scripted browsers, signed-in staff, or try/view beacons from browsers sending GPC / DNT (page views and card impressions already respected it). Middle-click on Try now counts. Surprise me is its own place.
- Retention cohorts leave out staff accounts; verified makers whose tools got try clicks or saves are counted.
- Lists default to a new **Picks** order: featured tools, then new or recently updated tools, then tools fewer people have seen, reshuffled daily. New, Trending and Popular are still in the sort menu.
- Makers can post product updates to their published tools. Moderators review them at `/admin/updates`; approved notes show on the tool page, and a meaningful update can be resurfaced in Picks once every 90 days.
- The home hero opens on a different featured tool each day, and the first rows of the home list no longer repeat the hero's tools.
- Home picks: the newest editor-published collection appears under search with its title and date ("Worth trying this week" for its first week). Editors refresh it by publishing a collection.
- "Share it with credit" in the hero links to Submit.
- Discovery analytics on our own D1: cards seen on screen, and tool views and try clicks credited to the place the tool was found (hero, picks, Explore, search, tags, collections, related, ...), plus daily explorers who tried a tool. Shown in `/admin/stats` with collection results and tools that are seen but rarely tried.
- Surprise me skips tools already shown in the visit, moves to another category, and leans toward tools with fewer recent views.
- My submissions shows cards seen, views, try clicks, saves, hearts and comments for your published tools.
- Cards leave out zero counts; the heart button stays.
- The home search box no longer spills out of its band on phones.
- Tool cards in a row line up: titles, taglines, and the site link with its counts start on the same line even when one card's text runs longer.
- Search results put tools whose name matches first, then tagline, tags and the try-this text, before the chosen sort.
- The home page ends with "Browse by category": a tile per category with its real tool count and an original illustration of what the category is about. Categories with no tools yet are left out.
- Lists filter from one row that sticks to the top at every width: a Sort menu (New, Trending, Popular, plus the timeframe for Popular) beside scrolling category tabs. Esc or a click outside closes the menu.
- Cards are lighter: name, a two-line tagline, then one row with the site (↗, opens it and counts as a Try) and the counts; tags live on the tool page. Grids show four columns from 1280px, and tool pages suggest four similar tools.
- Editors can write a short intro for each tag under Admin → Tags (migration 0011, audited); it shows on the tag page and as its description.

### Search engines and search terms

- Categories have their own pages at `/explore/<category>` with a short intro; old `?category=` links redirect there (301), keeping other filters.
- Every indexable page carries one JSON-LD graph: WebSite (with a search box action) and Organization, plus BreadcrumbList on tool, tag, category and collection pages, CollectionPage with the listed tools on tag, category and collection pages, and ProfilePage on profiles.
- Clearer titles and descriptions: tool pages say what kind of tool it is and who made it, tag and category pages say how many tools they hold.
- `/sitemap.xml` is now an index of `/sitemaps/pages.xml`, `/sitemaps/tools.xml` (with each cover as an image) and `/sitemaps/tags.xml`.
- `/admin/stats` lists the most searched Explore terms (migration 0012), each counted once per visitor per day and kept 180 days. Terms that look like an email, a link or a long number are never stored, and terms that find nothing are highlighted.

### Notifications

- A bell in the header counts what's new for you, and `/me/notifications` lists it (migration 0013): an editor asking for changes to, publishing or turning down your submission, a reply to your comment, and a new comment on a tool you listed. Opening the list marks everything read.
- Notifications point at the submission or comment rather than copying it, so a comment that is hidden or deleted disappears from the list. They are created in the same batch as the change they report and kept 90 days. Nothing is emailed.

### Submit form

- Clearer submit and edit form: styled made/found choice that shows which is picked, hints above each field, live character counts, a category select and a cover drop zone that match the rest of the site, and "Optional" marked the same way everywhere.
- The cover now has its own step; the rights checkbox appears once an image is picked, and a picked image can be removed again.
- After a failed submit, a summary at the top links to each field that needs a fix, and those fields are outlined in red.

### Share cards

- Tool, tag, category and collection pages get their own 1200×630 share image (`/og/<kind>/<id>.png`), drawn on the Worker with satori and resvg: the page title and blurb beside the tool covers, or generated art for tools without one. Each card is kept in R2 under `og/` and its URL changes whenever what it shows changes. Profiles and other pages keep the default image.
- Pages now declare the share image's type, size and alt text.
- Maker badges: makers get a **Get a badge** page (`/me/share/<slug>`) with HTML and Markdown snippets for a "Listed on Try Something" badge, or a "Verified maker" one once verified, in light and dark. The SVG at `/badge/<slug>.svg` has its words drawn as paths (`npm run badges:build` regenerates them), sets no cookies, and never reveals a tool's moderation state; links carry `utm_source=badge`.
- Makers can claim editor-picked listings: unowned editorial tools show **Made it? Claim this listing**, and the same proof as maker verification (meta tag or `/.well-known/trysometh.ing.txt`) moves the listing to their account as a verified maker, with a `maker_claimed` audit row. Listings someone already owns can't be claimed.

### Tool covers

- Submitters can upload a cover image (JPEG, PNG or WebP). The browser resizes it to 1600px and re-encodes it, the server checks the bytes and size, and it is stored privately in R2 (`TOOL_IMAGES` binding, migration 0010) until a moderator publishes it. Submitting one requires confirming the right to share it.
- Covers now follow one order everywhere: the uploaded image, then the site's own share image, then the generated illustration. Moderators see both images on the review page and choose which to publish.
- Replacing or removing a cover, or deleting the account before publication, deletes the file.
- The 16 new seed tools use their sites' share images where one exists (14 of 16).

### Fixes

- Maker verification failed with an SQL error because two string literals had lost their quotes.
- Narrow screens no longer scroll sideways on the submit form.
- Covers are shrunk once to 960px WebP with Cloudflare Images and kept in R2 (re-read from the source every 90 days), so the heaviest share image went from 2.2 MB to 73 KB and Explore's mobile Lighthouse score from 72 to 95.
- The hero's typed word uses a slightly darker coral so it meets the 3:1 contrast minimum for large text.
- The first cover on a page (featured slide, first card, tool page) loads with high priority instead of lazily, which cut the home page's mobile LCP from 5.0 s to 2.1 s in Lighthouse.
- Heart, logo and quick-search buttons have accessible names that include their visible text; the featured slide is no longer an `article` with a `group` role.
- Comments are on in production (plain text, rate-limited, hidden after three reports until a moderator decides).
- GitHub links open in a new tab. The account and mobile menus close on a click outside or Escape, and Sign out highlights the full row like the other menu items.

### Discovery

- Tag pages at `/tags/<tag>` list every tool with that tag, with related tags (tags that appear on the same tools) and their counts. Tool tags and the home page's popular tags link there; tags with at least two tools are in the sitemap.
- Explore takes a `tag` filter, shown as a removable chip.
- Popular has a timeframe: past month, past year or all time. Trending stays at the last 7 days.
- Tool pages show "More from <maker>" (same maker name, or the same person's own submissions) and "You might also like", ranked by shared tags and category.
- The quick view has a sticky bar with the tool name, heart, save and Try it, and Previous/Next buttons. ← and → step through the cards of the list behind it without adding history entries, so Back still returns to the list.

### Settings and account pages

- One Settings page at `/me/settings` with sections for Profile, Sign-in methods and Delete account (sidebar on desktop, tabs on phones); the account menu's Settings link now opens it. The old `/me/profile`, `/me/sign-in` and `/me/account` URLs redirect.
- Account and moderation pages sit in a centered column instead of hugging the left edge.
- On tablets and phones the category chips get their own row and fade at the edge to show they scroll.
- Admin → Tools turns into cards on phones; Saved tools and the 403 page have proper empty and error states; staff profiles say Admin or Moderator.
- The sign-in code email has a branded HTML version alongside the plain-text one, and pasting a code copied from it fills all six digits.

### Seed tools

- 16 new tools, so every category has at least three: Infinite Craft, The Deep Sea, WindowSwap and Radio Garden (Fun); Silk, tldraw, Kleki and JS Paint (Create); PairDrop, Wormhole, A Soft Murmur and Pomofocus (Productivity); The Evolution of Trust and Seeing Theory (Learn); Quick, Draw! (Play); Realtime Colors (Design). Each was opened in a browser and works without an account; makers are named only where we could confirm them.
- Every seed tool was opened and its 30-second try checked in a browser. Blob Opera, Haikei and PatternPad now say which button to press first, matching their current pages.

### Profile photos

- Upload a profile photo in Settings → Profile. It is cropped to a square and resized to 256px in the browser, checked again on the server (JPEG, PNG or WebP by their bytes, size limits) and stored in R2 (migration 0009, `AVATARS` binding).
- Without an upload, the photo from Google or GitHub is used; you can switch to initials instead.
- Photos show on public profiles, next to comments and in the account menu. Moderators can remove one from the profile page, with an audit row.

### One person, one account

- Signing in with Google, GitHub or an email code using the same verified email lands in the same account; accounts are never created for an email the provider hasn't verified.
- Settings → Sign-in methods (`/me/settings/sign-in`) to connect another provider (even with a different email) or disconnect one, never the last.
- Clear messages when an automatic join is refused; migration 0008 adds a case-insensitive unique index on email.

### Stats

- `/admin/stats` for moderators: visitors, page views, tool views, try clicks, top tools (with try rate), pages, sources, countries, phone share, community activity, and weekly retention of new accounts, for 7/30/90 days against the previous period.
- Site analytics counted on our own Worker and D1: a page-view beacon with no cookies or browser storage, daily totals only, visitors de-duplicated with the existing daily IP hash. Staff pages, bots, and browsers sending Global Privacy Control or Do Not Track are left out.
- Migration 0007 (site analytics); Privacy page and moderation runbook updated.

### M1 community

- Public profiles (`/users/:handle`) that exist only once a handle is chosen; profile settings with handle rules (reserved names, weekly change limit).
- Comments and one level of replies on tool pages, with edit and delete for authors, rate limits, duplicate guard, and a `COMMENTS_ENABLED` switch (off in production for now).
- Reports for listings and comments from a shared dialog; three reports auto-hide a comment pending review.
- Moderation area with tabs: Submissions, Reports, Comments, Tools (now with featured order), Collections (create, order, publish) and Roles (admins only). All actions audited.
- Maker verification by meta tag or `/.well-known/trysometh.ing.txt`, shown as a Verified maker badge.
- Self-serve account deletion; Privacy and Terms updated for profiles, comments and reports.
- Migrations 0005 (community) and 0006 (maker verification); unit and E2E tests for all of the above.

### Design v1 (first public commit)

The interface is design v1 (see ROADMAP.md).

- Astro 7 SSR app on Cloudflare Workers + Static Assets with D1 and KV bindings.
- D1 schema: Better Auth tables, tools, submissions, moderation events, bookmarks, hearts, daily tool stats, collections, rate limits.
- Design v1: editorial cream/coral/lavender/butter look, cursor-click logo and favicons, custom cursors and scrollbar, Open Graph images.
- Home: typewriter headline, crossfading featured slideshow, search band with popular tags, list filters (category, New/Trending/Popular) that update in place with skeleton loading, dismissible "submit a tool" nudge.
- Cards with the product's own share image (original illustration as fallback), hover Save/Try actions, heart/view/save counts.
- Quick view: tool pages open in a dialog over the list, with their own URL, Back/Forward and Escape support.
- Explore with large search, result count, sticky filters and infinite scroll; tool pages with "More in category", "Try next" and a sticky mobile Try bar; collections with cover mosaics; Surprise me.
- Hearts (signed-in, one per account) and page views counted once per visitor per tool per day from a daily-rotating salted IP hash.
- One engagement score (view 1, try 3, heart 5, save 5) for Trending (last 7 days) and Popular (all time); New is newest first. Only totals are shown, never the score.
- Sign-in with GitHub and Google (Better Auth); email OTP through Cloudflare Email Service as "Try Something <hello@trysometh.ing>", enabled once a real Turnstile secret is set.
- URL-first submission flow in three steps ("I made this" / "I found this"), SSRF-safe metadata suggestions, duplicate detection, Turnstile, rate limits.
- My submissions: status, editor notes, edit & resubmit, withdraw.
- Review dashboard with status filters, decisions with reasons, audit history, hide/unhide published tools.
- About, Contribute, Privacy and Terms pages.
- Sign-in card: Google, GitHub and email code in one place, "Last used" hint, loading states, invisible Turnstile, a focused code step with resend countdown and auto-submit.
- Real GitHub star count with KV cache and stale fallback; hidden when unavailable.
- Sitemap, robots (non-production hosts are not indexable), canonical URLs, Open Graph, JSON-LD.
- Security headers and Astro CSP with hashed scripts/styles.
- README with the brand logo for light and dark themes (`scripts/render-readme-logo.mjs`).
- Repository policy: TRADEMARK.md, AGENTS.md, fork-and-email contribution model, runbooks (moderation, takedown, rollback).
- Staging environment, migration guard in CI, manual "Promote to production" workflow, Dependabot, CODEOWNERS.
- `hello@trysometh.ing` via Cloudflare Email Routing.
- Unit tests and Playwright end-to-end flow tests.
- 13 editorial seed tools (links checked live; manual try QA pending).
