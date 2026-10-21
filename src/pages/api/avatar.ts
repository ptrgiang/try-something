import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { AVATAR_MAX_BYTES, avatarProblem, isAvatarKey, sniffImage } from "../../lib/avatar";
import { getMyProfile, setAvatar } from "../../lib/db";
import { rateLimit } from "../../lib/rate-limit";
import { isSameOrigin, json, newId } from "../../lib/util";

export const prerender = false;

async function gate(request: Request, locals: App.Locals) {
  if (!isSameOrigin(request)) return { error: json({ error: "Bad origin." }, 403) };
  const user = locals.user;
  if (!user) return { error: json({ error: "Sign in first." }, 401) };
  const profile = await getMyProfile(env.DB, user.id);
  if (!profile) return { error: json({ error: "Account not found." }, 404) };
  if (!(await rateLimit(env.DB, `avatar:${user.id}`, 12, 3600))) return { error: json({ error: "Too many photo changes. Try again in an hour." }, 429) };
  return { user, current: profile.avatar };
}

// multipart { photo } uploads a new photo. The browser crops and resizes it first; this re-checks the bytes.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!env.AVATARS) return json({ error: "Photo uploads aren't available here yet." }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES + 8192) return json({ error: "That photo is too large. Try a smaller one." }, 413);
  const g = await gate(request, locals);
  if (g.error) return g.error;
  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("photo");
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!(file instanceof File)) return json({ error: "Choose a photo to upload." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = sniffImage(bytes);
  const problem = avatarProblem(img, bytes.byteLength);
  if (problem || !img) return json({ error: problem }, 400);

  const key = `${g.user.id}/${newId()}.${img.ext}`;
  await env.AVATARS.put(key, bytes, { httpMetadata: { contentType: img.type } });
  if (!(await setAvatar(env.DB, g.user.id, g.current, key))) {
    await env.AVATARS.delete(key);
    return json({ error: "Your photo changed meanwhile. Reload and try again." }, 409);
  }
  if (isAvatarKey(g.current)) await env.AVATARS.delete(g.current);
  return json({ ok: true, url: `/avatars/${key}` });
};

// { use: "provider" | "initials" } removes an uploaded photo or switches between the account photo and initials.
export const PATCH: APIRoute = async ({ request, locals }) => {
  const g = await gate(request, locals);
  if (g.error) return g.error;
  let use: unknown;
  try {
    use = ((await request.json()) as { use?: unknown }).use;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (use !== "provider" && use !== "initials") return json({ error: "Invalid request." }, 400);
  if (!(await setAvatar(env.DB, g.user.id, g.current, use === "initials" ? "none" : null))) {
    return json({ error: "Your photo changed meanwhile. Reload and try again." }, 409);
  }
  if (isAvatarKey(g.current) && env.AVATARS) await env.AVATARS.delete(g.current);
  return json({ ok: true });
};
