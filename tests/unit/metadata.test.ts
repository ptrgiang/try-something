import { describe, expect, it } from "vitest";
import { fetchImage, fetchMetadata, parseMetadata } from "../../src/lib/metadata";
import { UnsafeUrlError } from "../../src/lib/url";

type Route = (url: string) => Response;

function fakeFetch(dns: Record<string, string[]>, pages: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const u = new URL(url);
      const name = u.searchParams.get("name")!;
      const type = u.searchParams.get("type");
      const ips = (dns[name] ?? []).filter((ip) => (type === "A" ? !ip.includes(":") : ip.includes(":")));
      return Response.json({ Answer: ips.map((data) => ({ type: type === "A" ? 1 : 28, data })) });
    }
    const route = pages[url];
    if (!route) return new Response("nope", { status: 404 });
    return route(url);
  }) as typeof fetch;
  return { impl, calls };
}

const html = (body: string, headers: Record<string, string> = {}) => () =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } });

describe("parseMetadata", () => {
  it("prefers og tags, decodes entities, strips markup and resolves favicon", () => {
    const meta = parseMetadata(
      `<html><head><title>Fallback</title><meta property="og:title" content="Haikei &amp; Friends"><meta name="description" content="<b>SVG</b> &quot;gen&quot;"><link rel="icon" href="/ico.png"></head>`,
      new URL("https://haikei.app/"),
    );
    expect(meta).toEqual({ title: "Haikei & Friends", description: 'SVG "gen"', favicon: "https://haikei.app/ico.png", image: null });
  });

  it("drops non-https favicons and handles missing tags", () => {
    const meta = parseMetadata(`<link rel="icon" href="javascript:alert(1)">`, new URL("https://a.com/"));
    expect(meta.title).toBeNull();
    expect(meta.favicon).toBeNull();
  });

  it("does not let script content into the title", () => {
    const meta = parseMetadata(`<title><script>alert(1)</script>Real</title>`, new URL("https://a.com/"));
    expect(meta.title).toBe("alert(1)Real");
    expect(meta.title).not.toContain("<");
  });
});

describe("fetchMetadata", () => {
  it("fetches a public page", async () => {
    const { impl } = fakeFetch({ "tool.example.org": ["104.16.1.1"] }, { "https://tool.example.org/": html("<title>Tool</title></head>") });
    const meta = await fetchMetadata(new URL("https://tool.example.org/"), { fetchImpl: impl });
    expect(meta.title).toBe("Tool");
  });

  it("rejects hosts that resolve to private addresses (DNS rebinding style)", async () => {
    const { impl, calls } = fakeFetch({ "evil.example.org": ["10.0.0.5"] }, { "https://evil.example.org/": html("x") });
    await expect(fetchMetadata(new URL("https://evil.example.org/"), { fetchImpl: impl })).rejects.toThrow(UnsafeUrlError);
    expect(calls.some((c) => c.startsWith("https://evil.example.org"))).toBe(false);
  });

  it("re-validates every redirect hop and blocks redirects to internal addresses", async () => {
    const { impl } = fakeFetch(
      { "short.example.org": ["104.16.1.1"] },
      { "https://short.example.org/": () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } }) },
    );
    await expect(fetchMetadata(new URL("https://short.example.org/"), { fetchImpl: impl })).rejects.toThrow(/IP addresses/);
  });

  it("blocks redirects to http", async () => {
    const { impl } = fakeFetch(
      { "a.example.org": ["104.16.1.1"] },
      { "https://a.example.org/": () => new Response(null, { status: 301, headers: { location: "http://a.example.org/" } }) },
    );
    await expect(fetchMetadata(new URL("https://a.example.org/"), { fetchImpl: impl })).rejects.toThrow(/https/);
  });

  it("limits redirect chains", async () => {
    const pages: Record<string, Route> = {};
    for (let i = 0; i < 6; i++) pages[`https://loop.example.org/${i}`] = () => new Response(null, { status: 302, headers: { location: `/${i + 1}` } });
    const { impl } = fakeFetch({ "loop.example.org": ["104.16.1.1"] }, pages);
    await expect(fetchMetadata(new URL("https://loop.example.org/0"), { fetchImpl: impl })).rejects.toThrow(/Too many redirects/);
  });

  it("refuses non-HTML responses", async () => {
    const { impl } = fakeFetch({ "f.example.org": ["104.16.1.1"] }, { "https://f.example.org/": () => new Response("{}", { headers: { "content-type": "application/json" } }) });
    await expect(fetchMetadata(new URL("https://f.example.org/"), { fetchImpl: impl })).rejects.toThrow(/not an HTML page/);
  });

  it("stops reading huge bodies at the byte cap", async () => {
    const big = "<title>Big</title>" + "a".repeat(2_000_000);
    const { impl } = fakeFetch({ "big.example.org": ["104.16.1.1"] }, { "https://big.example.org/": html(big) });
    const meta = await fetchMetadata(new URL("https://big.example.org/"), { fetchImpl: impl, maxBytes: 64 * 1024 });
    expect(meta.title).toBe("Big");
  });
});

describe("share image", () => {
  it("parses og:image (relative or absolute) and ignores non-https", () => {
    expect(parseMetadata(`<meta property="og:image" content="/og.png">`, new URL("https://a.com/x")).image).toBe("https://a.com/og.png");
    expect(parseMetadata(`<meta name="twitter:image" content="https://cdn.a.com/t.jpg">`, new URL("https://a.com/")).image).toBe("https://cdn.a.com/t.jpg");
    expect(parseMetadata(`<meta property="og:image" content="http://a.com/og.png">`, new URL("https://a.com/")).image).toBeNull();
  });

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const img = (body: BodyInit, type: string) => () => new Response(body, { headers: { "content-type": type } });

  it("accepts real raster images by magic bytes", async () => {
    const { impl } = fakeFetch({ "img.example.org": ["104.16.1.1"] }, { "https://img.example.org/og.png": img(png, "image/png") });
    const r = await fetchImage(new URL("https://img.example.org/og.png"), { fetchImpl: impl });
    expect(r?.type).toBe("image/png");
  });

  it("rejects SVG/HTML even when labelled as an image", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
    const { impl } = fakeFetch({ "img.example.org": ["104.16.1.1"] }, { "https://img.example.org/x.png": img(svg, "image/png") });
    expect(await fetchImage(new URL("https://img.example.org/x.png"), { fetchImpl: impl })).toBeNull();
  });

  it("rejects images over the size cap and private hosts", async () => {
    const big = new Uint8Array(2_000_000);
    big.set(png);
    const { impl } = fakeFetch(
      { "img.example.org": ["104.16.1.1"], "evil.example.org": ["192.168.1.10"] },
      { "https://img.example.org/big.png": img(big, "image/png"), "https://evil.example.org/a.png": img(png, "image/png") },
    );
    expect(await fetchImage(new URL("https://img.example.org/big.png"), { fetchImpl: impl, maxBytes: 1_000_000 })).toBeNull();
    await expect(fetchImage(new URL("https://evil.example.org/a.png"), { fetchImpl: impl })).rejects.toThrow(UnsafeUrlError);
  });
});
