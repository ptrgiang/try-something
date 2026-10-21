// Safe, bounded fetch of public page metadata (title, description, favicon, share image) for submissions.
// Metadata is only a suggestion: the submitter edits it and a moderator reviews it.

import { assertPublicHttpUrl, isPrivateAddress, UnsafeUrlError } from "./url";

export interface PageMetadata {
  finalUrl: string;
  title: string | null;
  description: string | null;
  favicon: string | null;
  image: string | null;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const DEFAULTS = { timeoutMs: 5000, maxBytes: 512 * 1024, maxRedirects: 3 };

/** Resolves A/AAAA via DNS-over-HTTPS and rejects hosts that point at non-public addresses. */
export async function assertResolvesPublic(host: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const answers: string[] = [];
  for (const type of ["A", "AAAA"]) {
    const res = await fetchImpl(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) throw new UnsafeUrlError("Could not resolve that host.");
    const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
    for (const a of body.Answer ?? []) if (a.type === 1 || a.type === 28) answers.push(a.data);
  }
  if (answers.length === 0) throw new UnsafeUrlError("That host does not resolve.");
  if (answers.some(isPrivateAddress)) throw new UnsafeUrlError("That host is not a public website.");
}

/** Fetches a public https URL with SSRF checks on every redirect hop. Caller must consume or cancel the body. */
export async function safeFetch(
  input: URL,
  opts: FetchOptions & { accept: string },
): Promise<{ res: Response; url: URL }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { timeoutMs, maxRedirects } = { ...DEFAULTS, ...opts };
  const deadline = AbortSignal.timeout(timeoutMs);
  let url = input;

  for (let hop = 0; ; hop++) {
    assertPublicHttpUrl(url);
    await assertResolvesPublic(url.hostname, fetchImpl);
    const res = await fetchImpl(url.toString(), {
      redirect: "manual",
      signal: deadline,
      headers: { accept: opts.accept, "user-agent": "TrySomethingBot/0.1 (+https://trysometh.ing/about)" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new UnsafeUrlError("The site redirected without a destination.");
      if (hop >= maxRedirects) throw new UnsafeUrlError("Too many redirects.");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new UnsafeUrlError(`The site responded with HTTP ${res.status}.`);
    }
    return { res, url };
  }
}

export async function fetchMetadata(input: URL, opts: FetchOptions = {}): Promise<PageMetadata> {
  const { res, url } = await safeFetch(input, { ...opts, accept: "text/html,application/xhtml+xml" });
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(type)) {
    await res.body?.cancel();
    throw new UnsafeUrlError("That link is not an HTML page.");
  }
  const html = await readLimited(res, opts.maxBytes ?? DEFAULTS.maxBytes);
  return { finalUrl: url.toString(), ...parseMetadata(html, url) };
}

const IMAGE_TYPES: { type: string; magic: (b: Uint8Array) => boolean }[] = [
  { type: "image/png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", magic: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { type: "image/webp", magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
  { type: "image/avif", magic: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
];

/**
 * Fetches a raster preview image. The type is decided by magic bytes, never by the remote
 * Content-Type, so SVG/HTML can't be smuggled in. Returns null if it isn't an allowed image.
 */
export async function fetchImage(
  input: URL,
  opts: FetchOptions = {},
): Promise<{ bytes: Uint8Array; type: string } | null> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const { res } = await safeFetch(input, { ...opts, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" });
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await res.body?.cancel();
    return null;
  }
  const bytes = await readBytes(res, maxBytes);
  if (!bytes) return null;
  const match = IMAGE_TYPES.find((t) => bytes.length > 12 && t.magic(bytes));
  return match ? { bytes, type: match.type } : null;
}

async function readBytes(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    // Metadata lives in <head>; stop early once it has closed or the cap is hit.
    if (total >= maxBytes || /<\/head>/i.test(out)) {
      await reader.cancel();
      break;
    }
  }
  return out;
}

export function parseMetadata(html: string, base: URL): Omit<PageMetadata, "finalUrl"> {
  const head = html.slice(0, 256 * 1024);
  const metas = [...head.matchAll(tagPattern("meta"))].map((m) => attrs(m[0]));
  const metaContent = (...keys: string[]) => {
    for (const key of keys) {
      const hit = metas.find((a) => (a.property ?? a.name ?? "").toLowerCase() === key);
      if (hit?.content) return hit.content;
    }
    return null;
  };
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const title = clean(metaContent("og:title", "twitter:title") ?? titleTag, 120);
  const description = clean(metaContent("og:description", "description", "twitter:description"), 300);

  const links = [...head.matchAll(tagPattern("link"))].map((m) => attrs(m[0]));
  const icon =
    links.find((a) => /(^|\s)(icon|shortcut icon)(\s|$)/i.test(a.rel ?? "") && a.href) ??
    links.find((a) => /apple-touch-icon/i.test(a.rel ?? "") && a.href);
  let image: string | null = null;
  try {
    const raw = metaContent("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src");
    const resolved = raw ? new URL(raw, base) : null;
    image = resolved && resolved.protocol === "https:" ? resolved.toString().slice(0, 1000) : null;
  } catch {
    image = null;
  }
  let favicon: string | null = null;
  try {
    const resolved = new URL(icon?.href ?? "/favicon.ico", base);
    favicon = resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    favicon = null;
  }
  return { title, description, favicon, image };
}

// Matches a tag while allowing ">" inside quoted attribute values.
function tagPattern(name: string): RegExp {
  return new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi");
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  }
  return out;
}

function clean(value: string | null, max: number): string | null {
  if (!value) return null;
  const text = decodeEntities(value)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}
