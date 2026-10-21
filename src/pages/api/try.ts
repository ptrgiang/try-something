import type { APIRoute } from "astro";
import { countOnce } from "../../lib/stats";

// Counts a "Try it" click (sent with navigator.sendBeacon).
export const POST: APIRoute = ({ request, locals }) => countOnce(request, "tries", locals.user ?? null);
