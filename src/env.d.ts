/// <reference types="astro/client" />

// Bindings and vars from wrangler.jsonc plus secrets; merged into Cloudflare.Env used by `cloudflare:workers`.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
    ASSETS: Fetcher;
    EMAIL?: SendEmail;
    AVATARS?: R2Bucket;
    TOOL_IMAGES?: R2Bucket;
    IMAGES?: ImagesBinding;
    PUBLIC_SITE_URL: string;
    PUBLIC_GITHUB_REPO: string;
    TURNSTILE_SITE_KEY: string;
    TURNSTILE_SECRET_KEY?: string;
    EMAIL_LOGIN_ENABLED: string;
    COMMENTS_ENABLED?: string;
    /** "true" only on the e2e server: count scripted browsers, which analytics otherwise ignores. */
    ANALYTICS_COUNT_AUTOMATION?: string;
    EMAIL_FROM?: string;
    BETTER_AUTH_SECRET: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GITHUB_TOKEN?: string;
  }
}

type CloudflareEnv = Cloudflare.Env;

declare namespace App {
  interface Locals {
    user: import("./lib/auth").SessionUser | null;
  }
}

// Precompiled wasm, as the Cloudflare Vite plugin imports it (Workers can't compile wasm at runtime).
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
