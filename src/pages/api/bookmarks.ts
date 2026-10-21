import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { listBookmarkIds, setBookmark } from "../../lib/db";
import { rateLimit } from "../../lib/rate-limit";
import { isSameOrigin, json } from "../../lib/util";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Sign in first." }, 401);
  return json({ ids: await listBookmarkIds(env.DB, locals.user.id) });
};

// { toolId, saved } toggles one bookmark; { merge: [ids] } merges anonymous local saves into the account.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const user = locals.user;
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!(await rateLimit(env.DB, `bookmark:${user.id}`, 120, 600))) return json({ error: "Slow down." }, 429);
  let body: { toolId?: unknown; saved?: unknown; merge?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (Array.isArray(body.merge)) {
    const ids = body.merge.filter((v): v is string => typeof v === "string" && v.length <= 64).slice(0, 200);
    for (const id of ids) await setBookmark(env.DB, user.id, id, true);
  } else if (typeof body.toolId === "string" && body.toolId.length <= 64) {
    await setBookmark(env.DB, user.id, body.toolId, body.saved !== false);
  } else {
    return json({ error: "Invalid request." }, 400);
  }
  return json({ ids: await listBookmarkIds(env.DB, user.id) });
};
