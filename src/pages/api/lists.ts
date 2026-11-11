import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createList, myLists, setListItem } from "../../lib/db";
import { rateLimit } from "../../lib/rate-limit";
import { isSameOrigin, json } from "../../lib/util";
import { parseList } from "../../lib/validation";

const ID = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const view = (l: { id: string; title: string; public: number; count: number; has?: number }) => ({ id: l.id, title: l.title, public: Boolean(l.public), count: l.count, has: Boolean(l.has) });

// The signed-in person's lists, each marked with whether ?tool= is in it (the "Add to list" picker).
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: "Sign in first." }, 401);
  const tool = url.searchParams.get("tool");
  return json({ lists: (await myLists(env.DB, locals.user.id, ID(tool) ? tool : null)).map(view) });
};

// { action: "toggle", listId, toolId, on } or { action: "create", title, toolId? } (adds the tool to the new list).
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const user = locals.user;
  if (!user) return json({ error: "Sign in first." }, 401);
  let body: { action?: unknown; listId?: unknown; toolId?: unknown; on?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (body.action === "create") {
    if (!(await rateLimit(env.DB, `list-create:${user.id}`, 20, 3600))) return json({ error: "That's a lot of new lists. Try again later." }, 429);
    const input = parseList({ title: body.title, description: "" });
    if (!input.ok) return json({ error: input.error }, 400);
    const list = await createList(env.DB, user.id, input.value);
    if ("error" in list) return json({ error: list.error }, 400);
    if (ID(body.toolId)) await setListItem(env.DB, user.id, list.id, body.toolId, true);
  } else if (body.action === "toggle" && ID(body.listId) && ID(body.toolId)) {
    if (!(await rateLimit(env.DB, `list-item:${user.id}`, 120, 600))) return json({ error: "Slow down." }, 429);
    const result = await setListItem(env.DB, user.id, body.listId, body.toolId, body.on !== false);
    if (result === "missing") return json({ error: "Not found." }, 404);
    if (result === "full") return json({ error: "That list is full." }, 400);
  } else {
    return json({ error: "Invalid request." }, 400);
  }
  return json({ lists: (await myLists(env.DB, user.id, ID(body.toolId) ? body.toolId : null)).map(view) });
};
