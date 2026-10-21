import type { APIRoute } from "astro";
import { countImpressions } from "../../lib/stats";

// Tool cards seen on screen, batched by the browser (see scripts/discovery.ts).
export const POST: APIRoute = ({ request, locals }) => countImpressions(request, locals.user ?? null);
