// Maker verification: the submitter proves control of the product's site by publishing a token,
// either in a meta tag on the listed page or in a /.well-known file on the same host.
// Fetches go through safeFetch, so the SSRF guard applies to every hop.

import { readLimited, safeFetch, type FetchOptions } from "./metadata";

export const META_NAME = "trysometh.ing-verification";
export const WELL_KNOWN_PATH = "/.well-known/trysometh.ing.txt";

/** Deterministic per (tool, user): nothing to store, and unguessable without the server secret. */
export async function makerToken(secret: string, toolId: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`maker:${toolId}:${userId}`)));
  return `ts-${[...sig.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** True when the page has <meta name="trysometh.ing-verification" content="TOKEN"> (attributes in any order). */
export function hasMetaToken(html: string, token: string): boolean {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    const name = attr("name");
    const content = attr("content");
    const value = (m: RegExpMatchArray | null) => (m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : "");
    if (value(name).toLowerCase() === META_NAME && value(content) === token) return true;
  }
  return false;
}

/** The well-known file may list several tokens (one per line), e.g. for co-makers. */
export function hasFileToken(text: string, token: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() === token);
}

export type ProofResult = { ok: true; method: "meta" | "file" } | { ok: false; error: string };

export async function checkMakerProof(toolUrl: string, token: string, opts: FetchOptions = {}): Promise<ProofResult> {
  const listed = new URL(toolUrl);
  const sameHost = (u: URL) => u.hostname === listed.hostname;
  const problems: string[] = [];

  try {
    const { res, url } = await safeFetch(listed, { ...opts, accept: "text/html,application/xhtml+xml" });
    // A redirect to another host would let that host vouch for this one.
    if (!sameHost(url)) {
      await res.body?.cancel();
      problems.push("the page redirects to another site");
    } else if (hasMetaToken(await readLimited(res, 512 * 1024), token)) {
      return { ok: true, method: "meta" };
    } else {
      problems.push("no matching meta tag on the page");
    }
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "the page couldn't be loaded");
  }

  try {
    const { res, url } = await safeFetch(new URL(WELL_KNOWN_PATH, listed.origin), { ...opts, accept: "text/plain" });
    if (sameHost(url) && hasFileToken(await readLimited(res, 4096), token)) return { ok: true, method: "file" };
    if (!sameHost(url)) await res.body?.cancel();
    problems.push(`no token in ${WELL_KNOWN_PATH}`);
  } catch {
    problems.push(`${WELL_KNOWN_PATH} wasn't found`);
  }
  return { ok: false, error: `We couldn't find your token: ${problems.join("; ")}.` };
}
