import { handle } from "@astrojs/cloudflare/handler";
import { proxyPostHog } from "./lib/posthog";

// /ingest is answered before Astro: trailingSlash "never" would 308 every PostHog batch (/ingest/e/),
// doubling requests and losing beacons sent as a page unloads. Middleware doesn't run for it.
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/ingest/")) return proxyPostHog(request, env);
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
