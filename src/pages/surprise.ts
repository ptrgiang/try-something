import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { surpriseSlug } from "../lib/db";
import { parseSkip } from "../lib/discover";

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

// ?from= is the tool page the visitor is on; ?seen= the tools this visit already showed and ?skip= those tried on
// this device (both sent by page scripts).
export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get("from");
  const seen = (url.searchParams.get("seen") ?? "").split(",").filter((s) => SLUG.test(s)).slice(0, 40);
  const skip = parseSkip(url.searchParams.get("skip"));
  const slug = await surpriseSlug(env.DB, from && SLUG.test(from) ? from : null, seen, Math.random, skip);
  return new Response(null, {
    status: 302,
    headers: { location: slug ? `/tools/${slug}` : "/explore", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
};
