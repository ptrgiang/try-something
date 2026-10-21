import { describe, expect, it } from "vitest";
import { formatCount, getStars } from "../../src/lib/github";
import { turnstileConfigured, verifyTurnstile } from "../../src/lib/turnstile";
import { clientKey } from "../../src/lib/util";
import { safeNext } from "../../src/lib/redirect";

function memoryKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = store.get(key);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

const gh = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch;

describe("getStars", () => {
  it("returns the real count and caches it", async () => {
    const kv = memoryKV();
    expect(await getStars("owner/repo", kv, { fetchImpl: gh({ stargazers_count: 42 }), now: 1000 })).toEqual({ count: 42, fetchedAt: 1000 });
    const cached = await getStars("owner/repo", kv, { fetchImpl: gh({}, 500), now: 2000 });
    expect(cached?.count).toBe(42);
  });

  it("falls back to stale cache on API errors, and returns null (not 0) when nothing is known", async () => {
    const kv = memoryKV();
    expect(await getStars("owner/repo", kv, { fetchImpl: gh({ message: "rate limited" }, 403) })).toBeNull();
    await getStars("owner/repo", kv, { fetchImpl: gh({ stargazers_count: 7 }), now: 0 });
    const stale = await getStars("owner/repo", kv, { fetchImpl: gh({}, 500), now: 2 * 60 * 60 * 1000 });
    expect(stale?.count).toBe(7);
    const tooOld = await getStars("owner/repo", kv, { fetchImpl: gh({}, 500), now: 30 * 24 * 60 * 60 * 1000 });
    expect(tooOld).toBeNull();
  });

  it("ignores malformed repo names and malformed responses", async () => {
    const kv = memoryKV();
    expect(await getStars("../../etc", kv, { fetchImpl: gh({ stargazers_count: 1 }) })).toBeNull();
    expect(await getStars("o/r", kv, { fetchImpl: gh({ stargazers_count: "999" }) })).toBeNull();
  });

  it("formats counts", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(2400)).toBe("2.4k");
    expect(formatCount(12345)).toBe("12k");
  });
});

describe("verifyTurnstile", () => {
  const siteverify = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;
  const base = { secret: "s", expectedAction: "submit", expectedHostname: "trysometh.ing" };

  it("fails closed without a secret or token", async () => {
    expect((await verifyTurnstile("tok", { ...base, secret: undefined, fetchImpl: siteverify({ success: true }) })).ok).toBe(false);
    expect((await verifyTurnstile("", { ...base, fetchImpl: siteverify({ success: true }) })).ok).toBe(false);
  });

  it("rejects failed, expired or replayed tokens", async () => {
    const r = await verifyTurnstile("tok", { ...base, fetchImpl: siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] }) });
    expect(r.ok).toBe(false);
  });

  it("checks action and hostname", async () => {
    expect((await verifyTurnstile("tok", { ...base, fetchImpl: siteverify({ success: true, action: "comment", hostname: "trysometh.ing" }) })).ok).toBe(false);
    expect((await verifyTurnstile("tok", { ...base, fetchImpl: siteverify({ success: true, action: "submit", hostname: "evil.com" }) })).ok).toBe(false);
    expect((await verifyTurnstile("tok", { ...base, fetchImpl: siteverify({ success: true, action: "submit", hostname: "trysometh.ing" }) })).ok).toBe(true);
  });

  it("only honors Cloudflare test keys on local (http) sites", async () => {
    const testSecret = "1x0000000000000000000000000000000AA";
    const testReply = siteverify({ success: true, action: "test", hostname: "example.com" });
    expect((await verifyTurnstile("tok", { ...base, secret: testSecret, fetchImpl: testReply })).ok).toBe(false);
    expect((await verifyTurnstile("tok", { ...base, secret: testSecret, allowTestKeys: true, fetchImpl: testReply })).ok).toBe(true);
    // A real secret never accepts a test-shaped reply.
    expect((await verifyTurnstile("tok", { ...base, fetchImpl: testReply })).ok).toBe(false);
    expect(turnstileConfigured(testSecret, "https://trysometh.ing")).toBe(false);
    expect(turnstileConfigured(testSecret, "http://localhost:4321")).toBe(true);
    expect(turnstileConfigured("0x4AAAAAAAreal", "https://trysometh.ing")).toBe(true);
    expect(turnstileConfigured(undefined, "http://localhost:4321")).toBe(false);
  });

  it("fails closed when siteverify is unreachable", async () => {
    const boom = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect((await verifyTurnstile("tok", { ...base, fetchImpl: boom })).ok).toBe(false);
  });
});

describe("clientKey", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["2001:db8:85a3:1:aaaa:bbbb:cccc:dddd", "2001:db8:85a3:1::/64"],
    ["2001:DB8:85a3:0001::1", "2001:db8:85a3:1::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    [null, "unknown"],
  ])("%s -> %s", (input, out) => expect(clientKey(input as string | null)).toBe(out));
});

describe("safeNext", () => {
  it.each([
    ["/submit", "/submit"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    [null, "/"],
  ])("%s -> %s", (input, out) => expect(safeNext(input as string | null)).toBe(out));
});
