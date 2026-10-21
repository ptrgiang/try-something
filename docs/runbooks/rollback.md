# Rollback

## Code

1. Dashboard → Workers & Pages → `try-something` → Deployments → pick the last good version → **Deploy**, or `npx wrangler rollback`.
2. Move `release` back to the matching commit so the next build doesn't redeploy the bad one: run **Promote to production** with that commit SHA (the workflow refuses non-fast-forward moves, so if it fails, revert on `main` instead and promote the revert).

Rolling back code does not roll back D1. That is why migrations must stay backward compatible: the previous code version has to keep working on the new schema.

## Data

- D1 Time Travel restores a database to any point in the last 30 days (Workers Paid) or 7 days (Free): `npx wrangler d1 time-travel restore DB --timestamp=<ISO time>`. This overwrites everything written after that time, including new users and submissions, so note the time first and announce it afterwards.
- A manual export taken before the release (`backups/`, never committed) can be imported into a fresh database for comparison.

## After

Write down what happened, what was rolled back, and the fix in the PR or commit that fixes it.
