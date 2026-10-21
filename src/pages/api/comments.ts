import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createComment, deleteOwnComment, editComment, getComment } from "../../lib/db";
import { authorCommentCheck } from "../../lib/moderation";
import { rateLimit } from "../../lib/rate-limit";
import { isSameOrigin, json } from "../../lib/util";
import { commentBody } from "../../lib/validation";

const enabled = () => env.COMMENTS_ENABLED === "true";

// Shared gate for every write: feature flag, same-origin, signed in, parsed JSON body.
async function gate(request: Request, locals: App.Locals) {
  if (!enabled()) return { error: json({ error: "Comments are turned off." }, 404) };
  if (!isSameOrigin(request)) return { error: json({ error: "Bad origin." }, 403) };
  const user = locals.user;
  if (!user) return { error: json({ error: "Sign in to comment." }, 401) };
  try {
    return { user, body: (await request.json()) as Record<string, unknown> };
  } catch {
    return { error: json({ error: "Invalid request." }, 400) };
  }
}

const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);

// { toolId, parentId?, body } posts a comment or a reply.
export const POST: APIRoute = async ({ request, locals }) => {
  const g = await gate(request, locals);
  if (g.error) return g.error;
  const toolId = id(g.body.toolId);
  if (!toolId) return json({ error: "Invalid request." }, 400);
  const text = commentBody(g.body.body);
  if (!text.ok) return json({ error: text.error }, 400);
  // Short burst limit plus a daily cap, both per account.
  if (!(await rateLimit(env.DB, `comment:${g.user.id}`, 6, 600)) || !(await rateLimit(env.DB, `comment-day:${g.user.id}`, 40, 86400))) {
    return json({ error: "You're commenting very fast. Take a breather and try again later." }, 429);
  }
  const res = await createComment(env.DB, { toolId, userId: g.user.id, parentId: id(g.body.parentId), body: text.value });
  if (!res.ok) return json({ error: res.error }, res.status);
  return json({ ok: true, id: res.id }, 201);
};

// { id, body } edits your own comment.
export const PATCH: APIRoute = async ({ request, locals }) => {
  const g = await gate(request, locals);
  if (g.error) return g.error;
  const commentId = id(g.body.id);
  const comment = commentId ? await getComment(env.DB, commentId) : null;
  if (!comment) return json({ error: "Comment not found." }, 404);
  const check = authorCommentCheck(g.user.id, comment);
  if (!check.ok) return json({ error: check.error }, check.status);
  const text = commentBody(g.body.body);
  if (!text.ok) return json({ error: text.error }, 400);
  if (!(await rateLimit(env.DB, `comment-edit:${g.user.id}`, 20, 600))) return json({ error: "Slow down." }, 429);
  if (!(await editComment(env.DB, comment.id, g.user.id, text.value))) return json({ error: "This comment changed meanwhile." }, 409);
  return json({ ok: true });
};

// { id } deletes your own comment.
export const DELETE: APIRoute = async ({ request, locals }) => {
  const g = await gate(request, locals);
  if (g.error) return g.error;
  const commentId = id(g.body.id);
  const comment = commentId ? await getComment(env.DB, commentId) : null;
  if (!comment) return json({ error: "Comment not found." }, 404);
  const check = authorCommentCheck(g.user.id, comment);
  if (!check.ok) return json({ error: check.error }, check.status);
  if (!(await deleteOwnComment(env.DB, comment.id, g.user.id))) return json({ error: "This comment changed meanwhile." }, 409);
  return json({ ok: true });
};
