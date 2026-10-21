// Profile photos: an upload in R2 wins, then the photo from Google or GitHub, then initials.
// user.avatar is NULL (provider photo), "none" (initials only) or the R2 key of an upload.

export const AVATAR_MAX_BYTES = 200_000;
export const AVATAR_MIN_SIDE = 32;
export const AVATAR_MAX_SIDE = 1024;
const KEY_RE = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$/;

export const isAvatarKey = (v: unknown): v is string => typeof v === "string" && KEY_RE.test(v);

export function avatarUrl(avatar: string | null | undefined, image: string | null | undefined): string | null {
  if (avatar === "none") return null;
  if (isAvatarKey(avatar)) return `/avatars/${avatar}`;
  return typeof image === "string" && image.startsWith("https://") && image.length <= 2048 ? image : null;
}

export interface SniffedImage {
  type: "image/webp" | "image/jpeg" | "image/png";
  ext: "webp" | "jpg" | "png";
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

/** Identifies JPEG, PNG and WebP by their bytes (never the filename or declared type) and reads the size. */
export function sniffImage(b: Uint8Array): SniffedImage | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, "PNG\r\n\x1a\n") && ascii(b, 12, "IHDR")) {
    const width = ((b[16] << 24) >>> 0) + (b[17] << 16) + (b[18] << 8) + b[19];
    const height = ((b[20] << 24) >>> 0) + (b[21] << 16) + (b[22] << 8) + b[23];
    return { type: "image/png", ext: "png", width, height };
  }
  if (b.length >= 30 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
    if (ascii(b, 12, "VP8 ")) return { type: "image/webp", ext: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (ascii(b, 12, "VP8L") && b[20] === 0x2f) {
      const width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
      const height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
      return { type: "image/webp", ext: "webp", width, height };
    }
    if (ascii(b, 12, "VP8X")) return { type: "image/webp", ext: "webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      // Start-of-frame markers carry the size; C4 (DHT), C8 and CC are not frames.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { type: "image/jpeg", ext: "jpg", width: u16be(b, i + 7), height: u16be(b, i + 5) };
      }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
        i += 2;
        continue;
      }
      i += 2 + u16be(b, i + 2);
    }
  }
  return null;
}

/** Why an upload is refused, or null when it can be stored. */
export function avatarProblem(img: SniffedImage | null, bytes: number): string | null {
  if (bytes > AVATAR_MAX_BYTES) return "That photo is too large. Try a smaller one.";
  if (!img) return "Use a JPEG, PNG or WebP image.";
  const { width, height } = img;
  if (width < AVATAR_MIN_SIDE || height < AVATAR_MIN_SIDE || width > AVATAR_MAX_SIDE || height > AVATAR_MAX_SIDE) {
    return `Use an image between ${AVATAR_MIN_SIDE} and ${AVATAR_MAX_SIDE} pixels on each side.`;
  }
  return null;
}
