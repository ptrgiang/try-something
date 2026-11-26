// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://trysometh.ing",
  output: "server",
  adapter: cloudflare({ imageService: "passthrough", sessionKVBindingName: "CACHE" }),
  trailingSlash: "never",
  // Settings moved under /me/settings; keep old links working.
  redirects: { "/me/profile": "/me/settings", "/me/sign-in": "/me/settings/sign-in", "/me/account": "/me/settings/account" },
  // Never inline small assets as data: URIs; the CSP only allows fonts from our own origin.
  vite: { build: { assetsInlineLimit: 0 } },
  security: {
    checkOrigin: true,
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        // Ship Track (visit counts for ship.trysometh.ing): its script and the beacon it sends.
        "connect-src 'self' https://ship.trysometh.ing",
        "frame-src https://challenges.cloudflare.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: { resources: ["'self'", "https://challenges.cloudflare.com", "https://ship.trysometh.ing"] },
    },
  },
});
