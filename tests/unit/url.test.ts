import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, canonicalKey, cleanUrl, isPrivateAddress, parseUserUrl, UnsafeUrlError } from "../../src/lib/url";

describe("parseUserUrl / assertPublicHttpUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(parseUserUrl("haikei.app").href).toBe("https://haikei.app/");
  });

  it.each([
    "http://example.com",
    "ftp://example.com",
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://2130706433/", // decimal IPv4 for 127.0.0.1
    "https://0x7f000001/",
    "https://[::1]/",
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal/",
    "https://printer.local/",
    "https://user:pass@example.com/",
    "https://example.com:8443/",
    "https://intranet/",
  ])("rejects %s", (input) => {
    expect(() => parseUserUrl(input)).toThrow(UnsafeUrlError);
  });

  it("accepts a normal public https URL", () => {
    expect(() => assertPublicHttpUrl(new URL("https://www.fffuel.co/sss/"))).not.toThrow();
  });
});

describe("isPrivateAddress", () => {
  it.each(["10.0.0.1", "127.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])(
    "flags %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["104.16.0.1", "8.8.8.8", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("canonicalKey", () => {
  it("treats www, trailing slash, fragments and tracking params as the same URL", () => {
    const a = canonicalKey("https://www.Haikei.app/?utm_source=x#top");
    const b = canonicalKey("https://haikei.app");
    expect(a).toBe(b);
  });
  it("keeps meaningful paths and query params", () => {
    expect(canonicalKey("https://musiclab.chromeexperiments.com/Song-Maker/")).toBe("musiclab.chromeexperiments.com/Song-Maker");
    expect(canonicalKey("https://a.com/x?b=2&a=1")).toBe("a.com/x?a=1&b=2");
    expect(canonicalKey("https://a.com/x")).not.toBe(canonicalKey("https://a.com/y"));
  });
  it("cleanUrl strips tracking params and fragments", () => {
    expect(cleanUrl("https://a.com/p?utm_campaign=x&id=3#frag")).toBe("https://a.com/p?id=3");
  });
});
