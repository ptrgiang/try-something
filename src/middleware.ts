import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getSessionUser } from "./lib/auth";

const PRIVATE_PREFIXES = ["/admin", "/me", "/submit", "/login", "/api"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, locals } = context;
  if (url.hostname === "www.trysometh.ing") return Response.redirect(`https://trysometh.ing${url.pathname}${url.search}`, 301);
  locals.user = null;
  if (!url.pathname.startsWith("/api/auth")) {
    try {
      locals.user = await getSessionUser(env, request.headers);
    } catch (err) {
      console.error("session lookup failed", err);
    }
  }

  let response = await next();
  try {
    response.headers.set("x-ts", "1");
    response.headers.delete("x-ts");
  } catch {
    // Some responses (e.g. Response.redirect) have immutable headers.
    response = new Response(response.body, response);
  }
  const headers = response.headers;
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  if (url.protocol === "https:") headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (PRIVATE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    headers.set("x-robots-tag", "noindex, nofollow");
    if (!headers.has("cache-control")) headers.set("cache-control", "private, no-store");
  }
  if (locals.user && !headers.has("cache-control")) headers.set("cache-control", "private, no-store");
  return response;
});
