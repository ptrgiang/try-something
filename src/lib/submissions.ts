// Shared handling for creating and editing submissions from form posts.

import type { SessionUser } from "./auth";
import { createSubmission, findDuplicate, updateSubmissionContent, type Submission } from "./db";
import { ownerCanEdit, ownerTransition } from "./moderation";
import { rateLimit } from "./rate-limit";
import { verifyTurnstile } from "./turnstile";
import { plainText, validateSubmission, type FieldErrors } from "./validation";
import { assertPublicHttpUrl } from "./url";
import { isToolImageKey, storeToolImage } from "./tool-image";

export type FormOutcome = { ok: true; id: string } | { ok: false; errors: FieldErrors; values: Record<string, string> };

const FIELDS = ["origin", "url", "name", "tagline", "tryThis", "why", "category", "tags", "makerName", "makerUrl", "metaTitle", "metaDescription", "metaFavicon", "metaImage"];

export function formValues(form: FormData): Record<string, string> {
  return Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "").slice(0, 2048)]));
}

/** The page's own share image URL, if it is a public https URL. Fetched later only through /media. */
function shareImage(values: Record<string, string>): string | null {
  try {
    const url = new URL(values.metaImage);
    assertPublicHttpUrl(url);
    return url.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

function sourceMeta(values: Record<string, string>) {
  const favicon = values.metaFavicon.startsWith("https://") ? values.metaFavicon.slice(0, 500) : null;
  return {
    title: plainText(values.metaTitle, 120) || null,
    description: plainText(values.metaDescription, 300) || null,
    favicon,
    image: shareImage(values),
    note: "Suggested by the metadata fetcher in the submitter's browser; untrusted.",
  };
}

async function guard(env: CloudflareEnv, request: Request, user: SessionUser, form: FormData): Promise<string | null> {
  const ts = await verifyTurnstile(form.get("cf-turnstile-response"), {
    secret: env.TURNSTILE_SECRET_KEY,
    ip: request.headers.get("cf-connecting-ip"),
    expectedAction: "submit",
    expectedHostname: new URL(env.PUBLIC_SITE_URL).hostname,
    allowTestKeys: !env.PUBLIC_SITE_URL.startsWith("https://"),
  });
  if (!ts.ok) return ts.error ?? "Bot check failed.";
  const hourly = await rateLimit(env.DB, `submit:h:${user.id}`, 5, 3600);
  const daily = await rateLimit(env.DB, `submit:d:${user.id}`, 20, 86400);
  if (!hourly || !daily) return "You're submitting a lot — please wait a while and try again.";
  return null;
}

export async function handleCreate(env: CloudflareEnv, request: Request, user: SessionUser): Promise<FormOutcome> {
  const form = await request.formData();
  const values = formValues(form);
  const blocked = await guard(env, request, user, form);
  if (blocked) return { ok: false, errors: { form: blocked }, values };
  const result = validateSubmission(values);
  if (!result.ok) return { ok: false, errors: result.errors, values };
  const dup = await findDuplicate(env.DB, result.value.canonicalKey);
  if (dup) {
    const msg = dup.kind === "tool" ? `This tool is already listed at /tools/${dup.slug}.` : "This URL is already waiting for review. Thanks for spotting it too!";
    return { ok: false, errors: { url: msg }, values };
  }
  // Stored last, once everything else passed, and removed again if the row isn't written.
  const upload = await storeToolImage(env.TOOL_IMAGES, user.id, form);
  if (upload && "error" in upload) return { ok: false, errors: { cover: upload.error }, values };
  try {
    const id = await createSubmission(env.DB, user.id, result.value, sourceMeta(values), shareImage(values), upload?.key ?? null);
    return { ok: true, id };
  } catch (err) {
    if (upload) await env.TOOL_IMAGES?.delete(upload.key);
    if (String(err).includes("UNIQUE")) return { ok: false, errors: { url: "This URL was just submitted by someone else." }, values };
    throw err;
  }
}

export async function handleEdit(
  env: CloudflareEnv,
  request: Request,
  user: SessionUser,
  sub: Submission,
): Promise<FormOutcome> {
  const form = await request.formData();
  const values = formValues(form);
  if (sub.user_id !== user.id) return { ok: false, errors: { form: "Not your submission." }, values };
  if (!ownerCanEdit(sub.status)) return { ok: false, errors: { form: "This submission can't be edited any more." }, values };
  const blocked = await guard(env, request, user, form);
  if (blocked) return { ok: false, errors: { form: blocked }, values };
  const result = validateSubmission(values);
  if (!result.ok) return { ok: false, errors: result.errors, values };
  const dup = await findDuplicate(env.DB, result.value.canonicalKey, sub.id);
  if (dup) return { ok: false, errors: { url: "Another listing or submission already uses this URL." }, values };
  // Editing a needs_changes submission resubmits it for review.
  let next = sub.status;
  if (sub.status === "needs_changes") {
    const t = ownerTransition(user.id, sub, "resubmit");
    if (!t.ok) return { ok: false, errors: { form: t.error }, values };
    next = t.to;
  }
  const upload = await storeToolImage(env.TOOL_IMAGES, user.id, form);
  if (upload && "error" in upload) return { ok: false, errors: { cover: upload.error }, values };
  const imageKey = upload ? upload.key : form.get("removeCover") === "on" ? null : undefined;
  const discard = async (key: string | null | undefined) => {
    if (isToolImageKey(key)) await env.TOOL_IMAGES?.delete(key);
  };
  try {
    const changed = await updateSubmissionContent(env.DB, sub, user.id, result.value, next, imageKey);
    if (!changed) {
      await discard(upload?.key);
      return { ok: false, errors: { form: "This submission changed meanwhile. Reload and try again." }, values };
    }
  } catch (err) {
    await discard(upload?.key);
    if (String(err).includes("UNIQUE")) return { ok: false, errors: { url: "Another open submission already uses this URL." }, values };
    throw err;
  }
  // Only open submissions are editable, so the replaced cover isn't on a published tool.
  if (imageKey !== undefined && sub.image_key !== imageKey) await discard(sub.image_key);
  return { ok: true, id: sub.id };
}
