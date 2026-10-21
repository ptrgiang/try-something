import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createReport } from "../../lib/db";
import { rateLimit } from "../../lib/rate-limit";
import { isSameOrigin, json } from "../../lib/util";
import { plainText, REPORT_REASON_IDS } from "../../lib/validation";

// { targetType: "tool" | "comment", targetId, reason, note? } files a report for the moderators.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!isSameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const user = locals.user;
  if (!user) return json({ error: "Sign in to report." }, 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const targetType = body.targetType === "tool" || body.targetType === "comment" ? body.targetType : null;
  const targetId = typeof body.targetId === "string" && body.targetId.length <= 64 ? body.targetId : "";
  const reason = typeof body.reason === "string" && REPORT_REASON_IDS.includes(body.reason) ? body.reason : null;
  if (!targetType || !targetId || !reason) return json({ error: "Pick a reason." }, 400);
  if (targetType === "comment" && env.COMMENTS_ENABLED !== "true") return json({ error: "Comments are turned off." }, 404);
  if (!(await rateLimit(env.DB, `report:${user.id}`, 10, 3600))) return json({ error: "You've sent a lot of reports. Try again later." }, 429);
  const res = await createReport(env.DB, { targetType, targetId, reporterId: user.id, reason, note: plainText(body.note, 500) || null });
  if (!res.ok) return json({ error: res.error }, 404);
  return json({ ok: true, duplicate: res.duplicate });
};
