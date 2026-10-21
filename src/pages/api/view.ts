import type { APIRoute } from "astro";
import { countOnce } from "../../lib/stats";

// Counts a tool page view (full page or quick view), sent with navigator.sendBeacon. Crawlers that
// don't run JavaScript never count.
export const POST: APIRoute = ({ request, locals }) => countOnce(request, "views", locals.user ?? null);
