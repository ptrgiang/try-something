export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** Rate-limit key for a client IP. IPv6 is reduced to its /64, which one household or server
 * usually owns in full; counting single addresses would let one host act as millions. */
export function clientKey(ip: string | null): string {
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** Rejects cross-site state-changing requests (defense in depth alongside SameSite cookies). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

/** "3 days ago" style label for server-rendered timestamps (the exact time goes in <time datetime>). */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  const steps: [number, string][] = [[60, "second"], [60, "minute"], [24, "hour"], [30, "day"], [12, "month"], [Infinity, "year"]];
  let n = s;
  for (const [size, unit] of steps) {
    if (n < size) return unit === "second" ? "just now" : `${n} ${unit}${n === 1 ? "" : "s"} ago`;
    n = Math.floor(n / size);
  }
  return "";
}

export const initials = (name: string | null | undefined): string =>
  (name ?? "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/**
 * Up to `n` items per group, taken in `order`, skipping items an earlier group already shows so that
 * neighbouring mosaics don't repeat the same pictures; repeats come back only to fill a short group.
 * Each group keeps its own candidate order.
 */
export function distinctPicks<T extends { id: string }>(order: string[], candidates: Map<string, T[]>, n: number): Map<string, T[]> {
  const used = new Set<string>();
  const out = new Map<string, T[]>();
  for (const key of order) {
    const pool = candidates.get(key) ?? [];
    const fresh = pool.filter((t) => !used.has(t.id));
    const picked = new Set([...fresh, ...pool].slice(0, n));
    const ordered = pool.filter((t) => picked.has(t));
    for (const t of ordered) used.add(t.id);
    out.set(key, ordered);
  }
  return out;
}
