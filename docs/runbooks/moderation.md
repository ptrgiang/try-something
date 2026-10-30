# Moderation

Everything lives under `/admin` (moderators and admins only): Submissions, Reports, Comments, Tools, Collections, Stats, and Roles (admins only). Every action is written to `moderation_event`.

## Reviewing submissions

Queue: `/admin/submissions`. Moderators cannot act on their own submissions; admins can, and the decision is logged under their name like any other.

### Checklist before publishing

- [ ] The URL is the **official** product page (not a review, mirror, affiliate or social post) and loads over HTTPS.
- [ ] You tried it yourself: the "try this in 30 seconds" text is true.
- [ ] Nothing harmful: no malware, phishing, scams, adult content, or tools whose main purpose is abuse.
- [ ] Not a duplicate (the form warns, but check renamed products).
- [ ] Name, tagline and tags are accurate, plain and free of hype.
- [ ] "I made this" claims are plausible; they show as maker submissions, not verified, until confirmed.
- [ ] The share image is the site's own og:image and is appropriate; untick it if in doubt.

### Outcomes

- **Publish**: meets everything above.
- **Needs changes**: fixable; write a specific note the submitter can act on.
- **Reject**: out of scope or unsafe; the note is visible to the submitter, keep it factual.

Every action is recorded in the moderation history. Never edit statuses directly in D1 except to recover from a bug, and note it in the audit trail.

## Reports and comments

- **Reports** (`/admin/reports`): grouped by target, most-reported first. **Keep** closes the reports (and restores a comment that was auto-hidden); **Hide** hides the comment or listing and closes them. Write the reason; it goes in the audit log, not to the reporter.
- A comment is hidden automatically once **3 different people** report it. It stays hidden until someone here decides.
- **Comments** (`/admin/comments`): recent comments by status. Hide with a reason, or restore a hidden one. Authors' own deletions show as "deleted" and can't be restored.
- Hide, don't argue. If a comment is borderline, keep it and move on; if it's abuse aimed at a person, hide it and check the author's other comments.
- **Profile photos**: open the person's profile and press **Remove photo**. They get initials, the uploaded file is deleted and the audit log records `remove_avatar`. Moderators can do this for members; only admins can for other staff. They can upload a new one, so if it keeps happening, treat it like repeated abusive comments.
- To switch comments off everywhere, set `COMMENTS_ENABLED` to `"false"` and deploy; existing comments stay in the database.

## Makers and verification

- "I made this" shows as *maker-submitted, not verified* until the submitter proves control of the site from **My submissions → Verify you made it** (a meta tag or `/.well-known/trysometh.ing.txt` with their token).
- Editor-picked listings nobody owns show **Made it? Claim this listing**. The same proof moves the listing to the claimant as a verified maker (`maker_claimed` in the audit trail). To undo a wrong claim: `UPDATE tool SET submitted_by = NULL, credit_type = 'editorial', maker_verified_at = NULL WHERE slug = '<slug>'`.
- If a verified claim is disputed, ask both sides for evidence by email. To remove the badge: `UPDATE tool SET maker_verified_at = NULL WHERE slug = '<slug>'`, and note it in the audit trail.

## Collections and featured tools

- **Collections** (`/admin/collections`): create a draft, add tools by slug or tool URL, reorder, then publish. A weekly pick is just a collection, e.g. "Weekend toys, week 43".
- **Featured** (`/admin/tools`): a number 1, 2, 3… puts a tool in the home slideshow in that order; 0 takes it out. Up to five show; the slideshow opens on a different one each UTC day (the same for everyone all day).
- **Home picks**: the home page shows the newest published collection that still has at least three live tools once the hero's featured tools are left out, with its title, description and publish date ("Worth trying this week" for the first seven days, "Editors' picks" after). To refresh it, publish a new collection; nothing else to change. If no collection qualifies, the section simply isn't shown.
- **Picks order** (the default sort on Explore, categories, tags and the home list): featured tools first, then tools published or resurfaced in the last 14 days (newest first), then everything else with the tools seen least in the last 30 days first and a shuffle that changes once a day. Search keeps name matches on top. The numbers live in `src/lib/picks.ts`.
- Featured and pick tools are left out of the unfiltered home list so the first rows aren't repeats; they stay everywhere else (Explore, categories, search, tags).

## Product updates

- Makers who listed their own tool ("I made this") can post an update from My submissions: what changed, plus new description, try-this and why. One can wait at a time, three per tool per 30 days.
- Review them at `/admin/updates`. Open the tool and check the claim. Approve copies the text onto the listing and shows the note under "Updates from the maker"; decline needs a note, which the maker sees.
- Tick **Resurface in Picks** only for a change worth a second look (a new feature, a redesign), not a typo or a price change. The tool then ranks with new tools for 14 days, and can't be resurfaced again for 90 days.
- You can't review your own update. Every step is in the audit history.

## Roles

- Admins grant moderator or admin at `/admin/users`, with a reason. Nobody can change their own role, and roles are never accepted from the client.
- Keep at least two admins once the team grows; the last admin can't delete their account.

## Stats

`/admin/stats` covers the last 7, 30 or 90 days (UTC), compared with the period before. Each environment has its own database; any host other than trysometh.ing shows a "Not production data" note.

### What is counted, and what isn't

- **Visitor**: a salted hash of the IP address that changes every UTC day. One visitor per network per day, so a household or office counts as one and one person on two networks as two. Nobody can be followed across days, so every "unique" number is **per day**; over a range they are **visitor-days**, never distinct people.
- **Not counted**: browsers that block JavaScript or send Global Privacy Control / Do Not Track, crawlers, scripted browsers (headless Chrome, Lighthouse, Playwright and similar), signed-in moderators and admins, and staff pages. Counts are a floor, not a census.
- Only daily totals are stored. The per-visitor state the funnel needs (`visit_day`: hash, source, two flags) is deleted after two days. Older totals are never rewritten.

### Definitions

| Metric | Unit and de-duplication |
|---|---|
| Visitor-days | First counted page load per visitor per day |
| Page views | Every counted page load (one person browsing 50 pages = 50) |
| Tool views | Tool page or quick view, once per visitor per tool per day |
| Try clicks | Click (or middle-click) on a tool's "Try it" link, once per visitor per tool per day. It means the site was opened, not used |
| Cards seen | Half a card on screen, once per tool and place per browser tab |
| Funnel: Visited | Visitor-days with a counted page load |
| Funnel: Engaged | Of those, saw a card or opened a tool |
| Funnel: Clicked Try | Of those, clicked Try (a try also counts as engaged, so steps nest) |
| Place: engaged / tried | Visitor-days that saw a card on, or opened a tool from, a place; and that clicked Try from it |
| Try rate (place, collection) | Tried ÷ engaged for that place |
| Try rate (source) | Clicked Try ÷ visits for that source |
| Unattributed | Tool views and try clicks counted per tool but not credited to a place (before places were tracked on 2026-10-23, or a button outside any place) |
| Verified makers with try clicks | Accounts with a published, verified "I made this" listing that got at least one try click |

- Rates below 30 in the denominator show as "too few". "Seen often, rarely tried" needs 50 cards seen. Treat both as prompts to look, not rankings.
- Tool views and try clicks are **not** a funnel: a try can come straight from a card. That's why the old "try clicks ÷ tool views" rate is gone.
- **Source** is `utm_source` (or `ref`), else the referring site, else "Direct or unknown". Medium and campaign come only from `utm_medium` / `utm_campaign`; nothing is inferred. Link campaigns as `?utm_source=<name>&utm_medium=<medium>&utm_campaign=<name>`.
- The funnel, sources and per-place visitor-days start on the day migration 0016 shipped; a range reaching further back says so.
- **Retention**: signed-in accounts only (staff excluded), active = loaded a page while signed in. Accounts that send GPC / DNT aren't marked active, so retention for them reads low. Signed-out retention is unavailable by design.
- Makers and finders see the counts for their own published tools in My submissions.

### Checking a number

Run these against the environment's D1 (`npx wrangler d1 execute DB --remote [--env staging] --command "..."`); dates are UTC.

- Visitor-days and page views: `SELECT SUM(visitors), SUM(views) FROM site_stat_daily WHERE day BETWEEN '<from>' AND '<to>'`
- Funnel: `SELECT SUM(visits), SUM(engaged), SUM(tried) FROM funnel_source_daily WHERE day BETWEEN ...`; the source table is the same rows grouped by `source, medium, campaign`.
- Per place: `surface_stat_daily` (cards seen, views, tries) and `funnel_surface_daily` (visitor-days); collections are the `collection:<slug>` rows.
- Unattributed: `SUM(tries)` from `tool_stat_daily` minus `SUM(tries)` from `surface_stat_daily` over the same days.
- End to end: open the site in a private window with `?utm_source=check`, scroll past a few cards, click one Try; within a minute the source row shows 1 visit, 1 engaged, 1 clicked Try. A second Try the same day changes nothing in the funnel.
