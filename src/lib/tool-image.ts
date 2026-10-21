// Tool covers: the submitter's upload (R2) wins, then the site's own share image, then generated art.
// Uploads stay private (moderators and the submitter only) until the tool is published with them.

import { sniffImage, type SniffedImage } from "./avatar";
import { newId } from "./util";

// The browser resizes to TOOL_IMAGE_TARGET_SIDE first; the byte cap leaves room for no-JS uploads.
export const TOOL_IMAGE_MAX_BYTES = 2_000_000;
export const TOOL_IMAGE_TARGET_SIDE = 1600;
export const TOOL_IMAGE_MIN_SIDE = 200;
export const TOOL_IMAGE_MAX_SIDE = 4096;
const KEY_RE = /^sub\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$/;

export const isToolImageKey = (v: unknown): v is string => typeof v === "string" && KEY_RE.test(v);

/** Cover URL for a tool card or page, or null for the generated art. */
export function toolImageSrc(tool: { id: string; image_key?: string | null; image_url: string | null }): string | null {
  return tool.image_key || tool.image_url ? `/media/tool/${tool.id}` : null;
}

/** Why an uploaded cover is refused, or null when it can be stored. */
export function toolImageProblem(img: SniffedImage | null, bytes: number): string | null {
  if (bytes > TOOL_IMAGE_MAX_BYTES) return "That image is too large. Use one under 2 MB.";
  if (!img) return "Use a JPEG, PNG or WebP image.";
  const { width, height } = img;
  if (width < TOOL_IMAGE_MIN_SIDE || height < TOOL_IMAGE_MIN_SIDE) return `Use an image at least ${TOOL_IMAGE_MIN_SIDE} pixels on each side.`;
  if (width > TOOL_IMAGE_MAX_SIDE || height > TOOL_IMAGE_MAX_SIDE) return `Use an image at most ${TOOL_IMAGE_MAX_SIDE} pixels on each side.`;
  return null;
}

export type UploadResult = { key: string } | { error: string } | null;

/**
 * Reads the optional `cover` file and the rights checkbox from a submission form and stores the image.
 * Returns null when no file was chosen. The caller deletes `key` again if saving the submission fails.
 */
export async function storeToolImage(bucket: R2Bucket | undefined, userId: string, form: FormData): Promise<UploadResult> {
  const file = form.get("cover");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!bucket) return { error: "Image uploads aren't available here yet. Submit without one." };
  if (form.get("coverRights") !== "on") return { error: "Confirm you may share this image, or remove it." };
  if (file.size > TOOL_IMAGE_MAX_BYTES) return { error: toolImageProblem(null, file.size)! };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = sniffImage(bytes);
  const problem = toolImageProblem(img, bytes.byteLength);
  if (problem || !img) return { error: problem! };
  const key = `sub/${userId}/${newId()}.${img.ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: img.type } });
  return { key };
}

// Cards show covers at ~400 CSS px and the tool page at ~600, so 960 covers 2x screens.
export const COVER_WIDTH = 960;

/**
 * Shrinks a cover to COVER_WIDTH WebP with Cloudflare Images. Keeps the original when the binding is
 * missing, the transform fails or the result isn't smaller. GIFs pass through so animation survives.
 */
export async function shrinkCover(
  images: ImagesBinding | undefined,
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string }> {
  if (!images || type === "image/gif") return { bytes, type };
  try {
    const out = await images
      .input(new Blob([bytes]).stream())
      .transform({ width: COVER_WIDTH, fit: "scale-down" })
      .output({ format: "image/webp", quality: 82 });
    const small = new Uint8Array(await out.response().arrayBuffer());
    return small.byteLength > 0 && small.byteLength < bytes.byteLength ? { bytes: small, type: "image/webp" } : { bytes, type };
  } catch {
    return { bytes, type };
  }
}

// Published covers are shrunk once and kept in R2 at cover/<toolId>.webp, so Images runs about once per tool
// rather than once per data center per day. The source is re-read after COVER_REFRESH_MS to pick up a new share image.
export const COVER_REFRESH_MS = 90 * 86400_000;
export const coverObjectKey = (toolId: string) => `cover/${toolId}.webp`;

export type Cover = { bytes: Uint8Array<ArrayBuffer>; type: string };

/**
 * The stored small cover for a published tool, made from `load()` when missing, stale or built from a
 * different source (`origin` is the upload key or share-image URL). A stale copy is kept when the source fails.
 */
export async function storedCover(
  bucket: R2Bucket,
  images: ImagesBinding | undefined,
  toolId: string,
  origin: string,
  load: () => Promise<Cover | null>,
  now = Date.now(),
): Promise<Cover | null> {
  const key = coverObjectKey(toolId);
  const stored = await bucket.get(key);
  const same = stored?.customMetadata?.origin === origin && stored.customMetadata?.width === String(COVER_WIDTH);
  const kept: Cover | null =
    stored && same ? { bytes: new Uint8Array(await stored.arrayBuffer()), type: stored.httpMetadata?.contentType ?? "image/webp" } : null;
  if (kept && stored && now - stored.uploaded.getTime() < COVER_REFRESH_MS) return kept;

  const loaded = await load();
  if (!loaded) return kept;
  const small = await shrinkCover(images, loaded.bytes, loaded.type);
  await bucket.put(key, small.bytes, { httpMetadata: { contentType: small.type }, customMetadata: { origin, width: String(COVER_WIDTH) } });
  return small;
}
