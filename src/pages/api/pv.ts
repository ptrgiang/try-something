import type { APIRoute } from "astro";
import { countPageView } from "../../lib/stats";

// Site analytics beacon, sent once per full page load by PageView.astro. Crawlers that don't run
// JavaScript never count.
export const POST: APIRoute = ({ request, locals }) => countPageView(request, locals.user ?? null);
