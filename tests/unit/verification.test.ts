import { describe, expect, it } from "vitest";
import { checkMakerProof, hasFileToken, hasMetaToken, makerToken, META_NAME } from "../../src/lib/verification";

const TOKEN = "ts-0123456789abcdef0123456789abcdef";

function fakeFetch(dns: Record<string, string[]>, pages: Record<string, () => Response>) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const u = new URL(url);
      const ips = (dns[u.searchParams.get("name")!] ?? []).filter((ip) => (u.searchParams.get("type") === "A") === !ip.includes(":"));
      return Response.json({ Answer: ips.map((data) => ({ type: data.includes(":") ? 28 : 1, data })) });
    }
    return pages[url]?.() ?? new Response("nope", { status: 404 });
  }) as typeof fetch;
}
const page = (body: string, type = "text/html") => () => new Response(body, { headers: { "content-type": type } });
const PUBLIC = { "maker.example.org": ["93.184.216.34"], "other.example.org": ["93.184.216.35"] };

describe("makerToken", () => {
  it("is stable per tool and user, and differs between users", async () => {
    const a = await makerToken("secret", "tool-1", "user-1");
    expect(a).toMatch(/^ts-[0-9a-f]{32}$/);
    expect(await makerToken("secret", "tool-1", "user-1")).toBe(a);
    expect(await makerToken("secret", "tool-1", "user-2")).not.toBe(a);
    expect(await makerToken("other", "tool-1", "user-1")).not.toBe(a);
  });
});

describe("hasMetaToken", () => {
  it("accepts the tag with attributes in any order and either quote style", () => {
    expect(hasMetaToken(`<meta name="${META_NAME}" content="${TOKEN}">`, TOKEN)).toBe(true);
    expect(hasMetaToken(`<META content='${TOKEN}' NAME='${META_NAME.toUpperCase()}' />`, TOKEN)).toBe(true);
  });
  it("ignores the token anywhere but the right meta tag", () => {
    expect(hasMetaToken(`<p>${META_NAME} ${TOKEN}</p>`, TOKEN)).toBe(false);
    expect(hasMetaToken(`<meta name="description" content="${TOKEN}">`, TOKEN)).toBe(false);
    expect(hasMetaToken(`<meta name="${META_NAME}" content="${TOKEN}x">`, TOKEN)).toBe(false);
  });
});

describe("hasFileToken", () => {
  it("matches a whole line", () => {
    expect(hasFileToken(`ts-other\n  ${TOKEN}  \n`, TOKEN)).toBe(true);
    expect(hasFileToken(`prefix ${TOKEN}`, TOKEN)).toBe(false);
  });
});

describe("checkMakerProof", () => {
  it("passes with the meta tag on the listed page", async () => {
    const fetchImpl = fakeFetch(PUBLIC, { "https://maker.example.org/app": page(`<head><meta name="${META_NAME}" content="${TOKEN}"></head>`) });
    expect(await checkMakerProof("https://maker.example.org/app", TOKEN, { fetchImpl })).toEqual({ ok: true, method: "meta" });
  });
  it("falls back to the well-known file", async () => {
    const fetchImpl = fakeFetch(PUBLIC, {
      "https://maker.example.org/": page("<p>hi</p>"),
      "https://maker.example.org/.well-known/trysometh.ing.txt": page(`${TOKEN}\n`, "text/plain"),
    });
    expect(await checkMakerProof("https://maker.example.org/", TOKEN, { fetchImpl })).toEqual({ ok: true, method: "file" });
  });
  it("doesn't let a redirect to another host vouch for the listed one", async () => {
    const fetchImpl = fakeFetch(PUBLIC, {
      "https://maker.example.org/": () => new Response(null, { status: 302, headers: { location: "https://other.example.org/" } }),
      "https://other.example.org/": page(`<meta name="${META_NAME}" content="${TOKEN}">`),
    });
    const r = await checkMakerProof("https://maker.example.org/", TOKEN, { fetchImpl });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/redirects to another site/);
  });
  it("refuses hosts that resolve to private addresses", async () => {
    const fetchImpl = fakeFetch({ "maker.example.org": ["10.0.0.5"] }, { "https://maker.example.org/": page(`<meta name="${META_NAME}" content="${TOKEN}">`) });
    expect((await checkMakerProof("https://maker.example.org/", TOKEN, { fetchImpl })).ok).toBe(false);
  });
});
