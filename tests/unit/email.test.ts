import { describe, expect, it } from "vitest";
import { signInCodeEmail } from "../../src/lib/email";

describe("signInCodeEmail", () => {
  it("puts the code in the subject, text and html", () => {
    const m = signInCodeEmail("482913");
    expect(m.subject).toBe("482913 is your Try Something sign-in code");
    expect(m.text).toContain("482913");
    expect(m.html).toContain("Your code is 482913.");
    // Spacing comes from letter-spacing only, so a copied code is just the digits.
    expect(m.html).toContain(">482913</td>");
    expect(m.html).not.toContain("&#8202;");
  });
  it("uses inline styles only and escapes the code", () => {
    const m = signInCodeEmail("<b>");
    expect(m.html).not.toMatch(/<style|<link|<script/i);
    expect(m.html).not.toContain("<b>");
    expect(m.html).toContain("&lt;b&gt;");
  });
});
