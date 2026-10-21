import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getAuth } from "../lib/auth";

// Form POST (origin-checked by Astro) so sign-out works without client JS.
export const POST: APIRoute = async ({ request }) => {
  const res = await getAuth(env).api.signOut({ headers: request.headers, asResponse: true });
  const headers = new Headers({ location: "/" });
  for (const cookie of res.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
};
