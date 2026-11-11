import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { setFollow } from "../../lib/db";
import { rateLimit } from "../../lib/rate-limit";
import { isSameOrigin, json } from "../../lib/util";

// { userId, follow } follows or unfollows a person with a public profile.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const user = locals.user;
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!(await rateLimit(env.DB, `follow:${user.id}`, 60, 600))) return json({ error: "Slow down." }, 429);
  let body: { userId?: unknown; follow?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof body.userId !== "string" || body.userId.length > 64 || body.userId === user.id) return json({ error: "Invalid request." }, 400);
  const follow = body.follow !== false;
  if (!(await setFollow(env.DB, user.id, body.userId, follow))) return json({ error: "Not found." }, 404);
  return json({ following: follow });
};
