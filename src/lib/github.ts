// Real GitHub star count for the public repo, cached in KV. Never fabricates a number:
// returns null when no verified count is available.
export interface StarCount {
  count: number;
  fetchedAt: number;
}

const FRESH_MS = 30 * 60 * 1000;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export async function getStars(
  repo: string,
  kv: KVNamespace,
  opts: { token?: string; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<StarCount | null> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const now = opts.now ?? Date.now();
  const key = `gh-stars:${repo}`;
  const cached = await kv.get<StarCount>(key, "json").catch(() => null);
  if (cached && now - cached.fetchedAt < FRESH_MS) return cached;
  try {
    const res = await (opts.fetchImpl ?? fetch)(`https://api.github.com/repos/${repo}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "try-something",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const body = (await res.json()) as { stargazers_count?: unknown };
    if (typeof body.stargazers_count !== "number") throw new Error("No stargazers_count");
    const fresh = { count: body.stargazers_count, fetchedAt: now };
    await kv.put(key, JSON.stringify(fresh), { expirationTtl: STALE_MS / 1000 }).catch(() => {});
    return fresh;
  } catch {
    return cached && now - cached.fetchedAt < STALE_MS ? cached : null;
  }
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "")}k`;
}
