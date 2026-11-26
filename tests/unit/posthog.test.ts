import { describe, expect, it } from "vitest";
import { captureServer, posthogAllowed, proxyPostHog, upstreamHeaders, upstreamUrl, visitorId } from "../../src/lib/posthog";
import { scrubProperties, scrubUrl } from "../../src/scripts/ship-analytics";

const env = { POSTHOG_PROJECT_KEY: "phc_test", POSTHOG_HOST: "https://us.i.posthog.com", BETTER_AUTH_SECRET: "s".repeat(32), ANALYTICS_COUNT_AUTOMATION: "false" };
const browser = { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0" };

describe("posthogAllowed", () => {
  it("needs a key and skips crawlers, GPC / DNT and staff", () => {
    expect(posthogAllowed(env, new Headers(browser), null)).toBe(true);
    expect(posthogAllowed({ ...env, POSTHOG_PROJECT_KEY: "" }, new Headers(browser), null)).toBe(false);
    expect(posthogAllowed(env, new Headers({ "user-agent": "Googlebot/2.1" }), null)).toBe(false);
    expect(posthogAllowed(env, new Headers({ "user-agent": "HeadlessChrome/130" }), null)).toBe(false);
    expect(posthogAllowed(env, new Headers({ ...browser, "sec-gpc": "1" }), null)).toBe(false);
    expect(posthogAllowed(env, new Headers({ ...browser, dnt: "1" }), null)).toBe(false);
    expect(posthogAllowed(env, new Headers(browser), { role: "moderator" })).toBe(false);
    expect(posthogAllowed(env, new Headers(browser), { role: "user" })).toBe(true);
  });
});

describe("visitorId", () => {
  it("is stable for a day and an IP, and changes with either", async () => {
    const a = await visitorId("secret", "203.0.113.7", "2026-11-26");
    expect(a).toMatch(/^v_[A-Za-z0-9_-]{22}$/);
    expect(await visitorId("secret", "203.0.113.7", "2026-11-26")).toBe(a);
    expect(await visitorId("secret", "203.0.113.7", "2026-11-27")).not.toBe(a);
    expect(await visitorId("secret", "203.0.113.8", "2026-11-26")).not.toBe(a);
  });
});

describe("PostHog proxy", () => {
  it("sends assets to the assets host and keeps a // path on PostHog", () => {
    const host = "https://us.i.posthog.com";
    expect(upstreamUrl(new URL("https://trysometh.ing/ingest/static/array.js?v=1"), host).href).toBe("https://us-assets.i.posthog.com/static/array.js?v=1");
    expect(upstreamUrl(new URL("https://trysometh.ing/ingest/array/phc_x/config.js"), host).host).toBe("us-assets.i.posthog.com");
    expect(upstreamUrl(new URL("https://trysometh.ing/ingest/e/?ip=0"), host).href).toBe("https://us.i.posthog.com/e/?ip=0");
    expect(upstreamUrl(new URL("https://trysometh.ing/ingest//evil.example/x"), host).host).toBe("us.i.posthog.com");
  });

  it("never forwards the visitor's IP or cookies", () => {
    const h = upstreamHeaders(
      new Headers({ cookie: "better-auth.session_token=x", "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.7", "content-type": "text/plain", ...browser }),
    );
    expect([...h.keys()].sort()).toEqual(["content-type", "user-agent"]);
  });

  it("is a 404 without a key and drops upstream cookies", async () => {
    expect((await proxyPostHog(new Request("https://trysometh.ing/ingest/e/"), { ...env, POSTHOG_PROJECT_KEY: "" })).status).toBe(404);
    const fake = (async () => new Response("ok", { headers: { "set-cookie": "a=b", "content-type": "text/plain" } })) as typeof fetch;
    const res = await proxyPostHog(new Request("https://trysometh.ing/ingest/e/", { method: "POST", body: "{}" }), env, fake);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("ok");
  });
});

describe("captureServer", () => {
  it("sends product_id and no person profile, and never throws", async () => {
    const sent: unknown[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response("{}");
    }) as unknown as typeof fetch;
    await captureServer(env, new Headers({ ...browser, "cf-connecting-ip": "203.0.113.7" }), null, "tool_submitted", {}, fake);
    expect(sent[0]).toMatchObject({ event: "tool_submitted", properties: { product_id: "try-something", $process_person_profile: false } });
    await expect(captureServer(env, new Headers(browser), null, "x", {}, (async () => Promise.reject(new Error("down"))) as typeof fetch)).resolves.toBeUndefined();
    await captureServer(env, new Headers({ ...browser, "sec-gpc": "1" }), null, "y", {}, fake);
    expect(sent).toHaveLength(1);
  });
});

describe("scrubbing what the browser sends", () => {
  it("keeps campaign tags on our pages and only the origin of other sites", () => {
    expect(scrubUrl("https://trysometh.ing/explore?q=me@example.com&utm_source=x&page=2#top", "trysometh.ing")).toBe("https://trysometh.ing/explore?utm_source=x");
    expect(scrubUrl("https://news.example.com/item?id=42", "trysometh.ing")).toBe("https://news.example.com");
    expect(scrubUrl("$direct", "trysometh.ing")).toBe("$direct");
  });

  it("drops titles and scrubs person properties too", () => {
    const out = scrubProperties(
      { $current_url: "https://trysometh.ing/tools/x?q=secret", title: "“secret” search", $set_once: { $initial_referrer: "https://a.example/private/path" }, product_id: "try-something" },
      "trysometh.ing",
    );
    expect(out).toEqual({ $current_url: "https://trysometh.ing/tools/x", $set_once: { $initial_referrer: "https://a.example" }, product_id: "try-something" });
  });
});
