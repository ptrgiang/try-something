import { describe, expect, it } from "vitest";
import { COVER_REFRESH_MS, isToolImageKey, shrinkCover, storedCover, storeToolImage, toolImageProblem, toolImageSrc } from "../../src/lib/tool-image";

// Just enough of a PNG for sniffImage: signature plus an IHDR with the size.
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function fakeBucket() {
  const puts: string[] = [];
  return { puts, bucket: { put: async (key: string) => void puts.push(key) } as unknown as R2Bucket };
}

function form(file: File | null, rights: boolean) {
  const f = new FormData();
  if (file) f.append("cover", file);
  if (rights) f.append("coverRights", "on");
  return f;
}

describe("toolImageSrc", () => {
  it("uses the media route for an upload or a share image, else the generated art", () => {
    expect(toolImageSrc({ id: "a", image_key: "sub/u/k.png", image_url: null })).toBe("/media/tool/a");
    expect(toolImageSrc({ id: "a", image_key: null, image_url: "https://x.dev/og.png" })).toBe("/media/tool/a");
    expect(toolImageSrc({ id: "a", image_key: null, image_url: null })).toBeNull();
  });
});

describe("toolImageProblem and keys", () => {
  it("accepts reasonable images and refuses tiny, huge or unknown ones", () => {
    expect(toolImageProblem({ type: "image/png", ext: "png", width: 1600, height: 900 }, 300_000)).toBeNull();
    expect(toolImageProblem({ type: "image/png", ext: "png", width: 120, height: 900 }, 300_000)).toMatch(/at least 200/);
    expect(toolImageProblem({ type: "image/png", ext: "png", width: 5000, height: 900 }, 300_000)).toMatch(/at most 4096/);
    expect(toolImageProblem(null, 300_000)).toMatch(/JPEG, PNG or WebP/);
    expect(toolImageProblem(null, 3_000_000)).toMatch(/too large/);
  });
  it("only trusts keys of the shape we write", () => {
    expect(isToolImageKey("sub/user_1/2f1c-ab.webp")).toBe(true);
    expect(isToolImageKey("../avatars/x.png")).toBe(false);
    expect(isToolImageKey("sub/u/x.svg")).toBe(false);
    expect(isToolImageKey(null)).toBe(false);
  });
});

describe("storeToolImage", () => {
  it("does nothing without a file", async () => {
    const { bucket, puts } = fakeBucket();
    expect(await storeToolImage(bucket, "u1", form(null, false))).toBeNull();
    expect(puts).toEqual([]);
  });
  it("needs the rights checkbox and a real image before storing", async () => {
    const { bucket, puts } = fakeBucket();
    const good = new File([png(800, 600)], "x.png");
    expect(await storeToolImage(bucket, "u1", form(good, false))).toEqual({ error: expect.stringMatching(/Confirm/) });
    const fake = new File([new TextEncoder().encode("<svg onload=alert(1)>".padEnd(64))], "x.png", { type: "image/png" });
    expect(await storeToolImage(bucket, "u1", form(fake, true))).toEqual({ error: expect.stringMatching(/JPEG, PNG or WebP/) });
    expect(puts).toEqual([]);
    const ok = await storeToolImage(bucket, "u1", form(good, true));
    expect(ok && "key" in ok && isToolImageKey(ok.key) && ok.key.startsWith("sub/u1/")).toBe(true);
    expect(puts).toHaveLength(1);
  });
  it("says so when uploads aren't configured", async () => {
    expect(await storeToolImage(undefined, "u1", form(new File([png(800, 600)], "x.png"), true))).toEqual({ error: expect.stringMatching(/aren't available/) });
  });
});

describe("shrinkCover", () => {
  const big = new Uint8Array(1000);
  const images = (out: number | Error) => {
    const seen: unknown[] = [];
    const binding = {
      input: () => ({
        transform: (t: unknown) => (seen.push(t), {
          output: async (o: unknown) => {
            seen.push(o);
            if (out instanceof Error) throw out;
            return { response: () => new Response(new Uint8Array(out)) };
          },
        }),
      }),
    } as unknown as ImagesBinding;
    return { binding, seen };
  };

  it("serves the smaller WebP", async () => {
    const { binding, seen } = images(200);
    const r = await shrinkCover(binding, big, "image/png");
    expect(r.type).toBe("image/webp");
    expect(r.bytes.byteLength).toBe(200);
    expect(seen[0]).toEqual({ width: 960, fit: "scale-down" });
  });
  it("keeps the original when the result is larger, the transform fails, there is no binding, or it's a GIF", async () => {
    expect((await shrinkCover(images(2000).binding, big, "image/png")).type).toBe("image/png");
    expect((await shrinkCover(images(new Error("9412")).binding, big, "image/png")).bytes).toBe(big);
    expect((await shrinkCover(undefined, big, "image/jpeg")).type).toBe("image/jpeg");
    const gif = images(10);
    expect((await shrinkCover(gif.binding, big, "image/gif")).type).toBe("image/gif");
    expect(gif.seen).toEqual([]);
  });
});

describe("storedCover", () => {
  type Obj = { bytes: Uint8Array; meta: Record<string, string>; type: string; uploaded: Date };
  function memoryBucket(now: number) {
    const objects = new Map<string, Obj>();
    const bucket = {
      get: async (k: string) => {
        const o = objects.get(k);
        return o && { uploaded: o.uploaded, customMetadata: o.meta, httpMetadata: { contentType: o.type }, arrayBuffer: async () => o.bytes.slice().buffer };
      },
      put: async (k: string, bytes: Uint8Array, opts: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }) =>
        void objects.set(k, { bytes, meta: opts.customMetadata, type: opts.httpMetadata.contentType, uploaded: new Date(now) }),
    } as unknown as R2Bucket;
    return { bucket, objects };
  }
  const shrinkTo = (n: number) =>
    ({ input: () => ({ transform: () => ({ output: async () => ({ response: () => new Response(new Uint8Array(n)) }) }) }) }) as unknown as ImagesBinding;
  const original = { bytes: new Uint8Array(1000), type: "image/png" };

  it("shrinks once, then serves the stored copy without loading the source", async () => {
    const t0 = Date.UTC(2026, 9, 22);
    const { bucket, objects } = memoryBucket(t0);
    let loads = 0;
    const load = async () => (loads++, original);
    expect((await storedCover(bucket, shrinkTo(100), "t1", "https://x.dev/og.png", load, t0))?.bytes.byteLength).toBe(100);
    expect((await storedCover(bucket, shrinkTo(100), "t1", "https://x.dev/og.png", load, t0 + 86400_000))?.type).toBe("image/webp");
    expect(loads).toBe(1);
    expect([...objects.keys()]).toEqual(["cover/t1.webp"]);
  });
  it("rebuilds for a new source or after the refresh period, and keeps the old copy if the source is gone", async () => {
    const t0 = Date.UTC(2026, 9, 22);
    const { bucket } = memoryBucket(t0);
    await storedCover(bucket, shrinkTo(100), "t1", "a", async () => original, t0);
    let loads = 0;
    await storedCover(bucket, shrinkTo(50), "t1", "b", async () => (loads++, original), t0);
    expect(loads).toBe(1);
    const later = t0 + COVER_REFRESH_MS + 1;
    const kept = await storedCover(bucket, shrinkTo(10), "t1", "b", async () => (loads++, null), later);
    expect(loads).toBe(2);
    expect(kept?.bytes.byteLength).toBe(50);
  });
});
