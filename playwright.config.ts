import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 48731);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
  ],
  // E2E_BASE_URL points at a deployed site instead; only anonymous tests can run there.
  webServer: process.env.E2E_BASE_URL ? undefined : {
    // Better Auth only trusts its own base URL, so point it at the test server. Without --local-upstream the
    // custom-domain routes make wrangler dev send Host trysometh.ing (app acts as production), and the real
    // Turnstile site key rejects 127.0.0.1, hence the always-pass test key.
    command: `npx wrangler dev --port ${port} --ip 127.0.0.1 --inspector-port 0 --local-upstream 127.0.0.1:${port} --var PUBLIC_SITE_URL:http://127.0.0.1:${port} --var ANALYTICS_COUNT_AUTOMATION:true --var TURNSTILE_SITE_KEY:1x00000000000000000000AA`,
    url: `http://127.0.0.1:${port}/robots.txt`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
