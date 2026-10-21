import { describe, expect, it } from "vitest";
import { avatarProblem, avatarUrl, isAvatarKey, sniffImage } from "../../src/lib/avatar";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const pad = (n: number) => new Array(n).fill(0);

const png = (w: number, h: number) =>
  bytes([0x89], "PNG\r\n\x1a\n", [0, 0, 0, 13], "IHDR", [w >>> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255], [h >>> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255], pad(8));
const jpeg = (w: number, h: number) =>
  bytes([0xff, 0xd8], [0xff, 0xe0, 0, 16], pad(14), [0xff, 0xc4, 0, 4, 0, 0], [0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255], pad(12));
const webpLossy = (w: number, h: number) => bytes("RIFF", pad(4), "WEBP", "VP8 ", pad(4), pad(6), [w & 255, w >> 8, h & 255, h >> 8], pad(4));
const webpX = (w: number, h: number) =>
  bytes("RIFF", pad(4), "WEBP", "VP8X", pad(4), pad(4), [(w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16], [(h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16], pad(4));

describe("sniffImage", () => {
  it("reads type and size from PNG, JPEG and WebP bytes", () => {
    expect(sniffImage(png(300, 200))).toEqual({ type: "image/png", ext: "png", width: 300, height: 200 });
    expect(sniffImage(jpeg(640, 480))).toEqual({ type: "image/jpeg", ext: "jpg", width: 640, height: 480 });
    expect(sniffImage(webpLossy(256, 256))).toEqual({ type: "image/webp", ext: "webp", width: 256, height: 256 });
    expect(sniffImage(webpX(5000, 40))).toEqual({ type: "image/webp", ext: "webp", width: 5000, height: 40 });
  });
  it("rejects anything else, whatever it claims to be", () => {
    expect(sniffImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(bytes("GIF89a", pad(30)))).toBeNull();
    expect(sniffImage(bytes([0xff, 0xd8], "not a jpeg at all"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("avatarProblem", () => {
  it("accepts a normal photo and refuses huge, tiny or unknown images", () => {
    expect(avatarProblem(sniffImage(png(256, 256)), 30_000)).toBeNull();
    expect(avatarProblem(sniffImage(png(256, 256)), 300_000)).toMatch(/too large/);
    expect(avatarProblem(sniffImage(webpX(5000, 5000)), 1000)).toMatch(/between/);
    expect(avatarProblem(sniffImage(png(16, 16)), 1000)).toMatch(/between/);
    expect(avatarProblem(null, 1000)).toMatch(/JPEG, PNG or WebP/);
  });
});

describe("avatarUrl", () => {
  it("prefers an upload, then the provider photo, unless initials were chosen", () => {
    expect(avatarUrl("u1/abc.webp", "https://lh3.googleusercontent.com/a")).toBe("/avatars/u1/abc.webp");
    expect(avatarUrl(null, "https://avatars.githubusercontent.com/u/1")).toBe("https://avatars.githubusercontent.com/u/1");
    expect(avatarUrl("none", "https://avatars.githubusercontent.com/u/1")).toBeNull();
    expect(avatarUrl(null, null)).toBeNull();
    expect(avatarUrl(null, "http://insecure.example/a.png")).toBeNull();
    expect(avatarUrl("../../etc/passwd", null)).toBeNull();
  });
  it("only accepts keys this app writes", () => {
    expect(isAvatarKey("u1/9f1c-2b.webp")).toBe(true);
    expect(isAvatarKey("u1/x.svg")).toBe(false);
    expect(isAvatarKey("../x.webp")).toBe(false);
  });
});
