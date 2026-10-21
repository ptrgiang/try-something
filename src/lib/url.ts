// URL normalization and public-URL safety checks for submissions and metadata fetching.

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|ref_src|source|igshid|yclid)$/i;

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".arpa",
  ".test",
  ".invalid",
  ".example",
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

export class UnsafeUrlError extends Error {}

/** Parse a user-supplied URL, adding https:// when the scheme is missing. */
export function parseUserUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new UnsafeUrlError("Enter a URL under 2048 characters.");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid URL.");
  }
  assertPublicHttpUrl(url);
  return url;
}

/** Throws unless the URL is an https URL on a public hostname with the default port. */
export function assertPublicHttpUrl(url: URL): void {
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https:// links are accepted.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with credentials are not accepted.");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("Only the default https port is accepted.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(host)) throw new UnsafeUrlError("Links to raw IP addresses are not accepted.");
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("That host is not a public website.");
  }
  if (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host) || host.startsWith(".") || host.includes("..")) {
    throw new UnsafeUrlError("That host is not a public website.");
  }
}

export function isIpLiteral(host: string): boolean {
  if (host.startsWith("[") || host.includes(":")) return true;
  // WHATWG URL already canonicalizes decimal/hex/octal IPv4 forms to dotted quads.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** True for addresses that must never be fetched (private, loopback, link-local, CGNAT, multicast, etc). */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6) || v6.startsWith("64:ff9b:") || v6.startsWith("2001:db8");
}

/**
 * Stable key used to detect duplicate submissions. Conservative: ignores scheme, "www.",
 * fragments, tracking params, default index paths and trailing slashes; keeps meaningful paths.
 */
export function canonicalKey(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input) : new URL(input.href);
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const path = url.pathname.replace(/\/(index\.html?)?$/i, "").replace(/\/+$/, "");
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  return `${host}${path}${query}`;
}

/** Clean URL to store and link to: https, no fragment, no tracking params. */
export function cleanUrl(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input) : new URL(input.href);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
