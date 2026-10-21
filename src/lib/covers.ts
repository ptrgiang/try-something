import { env } from "cloudflare:workers";
import { fetchImage } from "./metadata";
import { isToolImageKey, shrinkCover, storedCover, type Cover } from "./tool-image";

/** The cover as submitted: the upload in R2, else the product's share image fetched through the SSRF guard. */
export async function loadCoverOriginal(key: string | null, source: string | null): Promise<Cover | null> {
  if (isToolImageKey(key) && env.TOOL_IMAGES) {
    const object = await env.TOOL_IMAGES.get(key);
    if (object) return { bytes: new Uint8Array(await object.arrayBuffer()), type: object.httpMetadata?.contentType ?? "application/octet-stream" };
  }
  if (!source) return null;
  try {
    const fetched = await fetchImage(new URL(source), { timeoutMs: 8000 });
    return fetched ? { bytes: fetched.bytes as Uint8Array<ArrayBuffer>, type: fetched.type } : null;
  } catch {
    return null;
  }
}

/** A published tool's shrunk cover, from the copy kept in R2 when there is one. */
export async function publicCover(toolId: string, key: string | null, source: string | null): Promise<Cover | null> {
  const origin = isToolImageKey(key) ? `upload:${key}` : (source ?? "");
  if (!origin) return null;
  const load = () => loadCoverOriginal(key, source);
  if (env.TOOL_IMAGES) return storedCover(env.TOOL_IMAGES, env.IMAGES, toolId, origin, load);
  const original = await load();
  return original && shrinkCover(env.IMAGES, original.bytes, original.type);
}
