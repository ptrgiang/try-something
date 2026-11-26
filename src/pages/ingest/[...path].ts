import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { proxyPostHog } from "../../lib/posthog";

// PostHog through our own origin (src/lib/posthog.ts), so the CSP stays connect-src 'self'.
export const ALL: APIRoute = ({ request }) => proxyPostHog(request, env);
