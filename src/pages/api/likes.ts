import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { listLikedIds, setLike } from "../../lib/db";
import { rateLimit } from "../../lib/rate-limit";
import { isSameOrigin, json } from "../../lib/util";

// Hearts need an account: anonymous hearts would be one click per cleared cookie.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Sign in first." }, 401);
  return json({ ids: await listLikedIds(env.DB, locals.user.id) });
};

// { toolId, liked } sets one heart.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const user = locals.user;
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!(await rateLimit(env.DB, `like:${user.id}`, 120, 600))) return json({ error: "Slow down." }, 429);
  let body: { toolId?: unknown; liked?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof body.toolId !== "string" || body.toolId.length > 64) return json({ error: "Invalid request." }, 400);
  await setLike(env.DB, user.id, body.toolId, body.liked !== false);
  return json({ ok: true });
};
