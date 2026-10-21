import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getAuth } from "../../../lib/auth";

export const prerender = false;

// Only the endpoints this site uses are reachable over HTTP. Everything else Better Auth ships
// (update-user, change-email, token endpoints, password flows) returns 404, so profile fields shown
// publicly, like the name used for submitter credit, can't be rewritten. Connecting a provider from
// /me/settings/sign-in doesn't touch them either (updateUserInfoOnLink stays off).
const ALLOWED =
  /^\/api\/auth\/(sign-in\/social|sign-in\/email-otp|email-otp\/send-verification-otp|link-social|unlink-account|callback\/(github|google)|get-session|sign-out|error|ok)$/;

export const ALL: APIRoute = ({ request }) => {
  if (!ALLOWED.test(new URL(request.url).pathname)) return new Response("Not found", { status: 404 });
  return getAuth(env).handler(request);
};
