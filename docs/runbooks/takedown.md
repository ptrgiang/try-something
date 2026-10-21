# Takedown and correction requests

Requests come by email to hello@trysometh.ing (or the site owner's contact). Typical cases: a maker asks for their tool or its share image to be removed, a listing is inaccurate, or credit is wrong.

## Steps

1. **Confirm who is asking.** For removal of a listing, a reply from an address on the product's own domain, or a change on the product's site or repository, is enough. Credit disputes need the same.
2. **Act quickly on images.** Share images (og:image) are shown only with credit and can be removed without discussion. There is no admin button for this yet:
   `npx wrangler d1 execute DB --remote --command "UPDATE tool SET image_url = NULL WHERE slug = '<slug>'"`.
   The generated cover art is shown instead. Also delete the shrunk copy kept in R2 (`<id>` is the tool's `id`):
   `npx wrangler r2 object delete try-something-tool-images/cover/<id>.webp --remote`.
   And the tool's share card, which draws the cover:
   `npx wrangler r2 object delete try-something-tool-images/og/tool/<slug>.png --remote`.
   Cached copies at `/media/tool/<id>` expire within a day. Share cards get a new URL once the cover is gone, so pages stop pointing at the old one; tag, category and collection cards that showed it are redrawn the same way.
3. **Hide rather than delete.** Admin → Tools → **Hide**. The tool disappears from Explore, search, collections and the sitemap; the audit history is kept.
4. **Corrections**: there is no editor UI for published listings yet. Update the `tool` row in D1 and note the change in the reply.
5. Reply to the requester with what was done.

## Personal data

Account deletion requests: delete the `user` row. Sessions, linked accounts, bookmarks and the user's submissions (with their review history) are deleted by cascade; published tools stay but lose the submitter credit (`submitted_by` becomes NULL). Answer within 30 days.
