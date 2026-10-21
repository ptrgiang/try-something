import { describe, expect, it } from "vitest";
import { authErrorMessage, EMAIL_NOT_VERIFIED, signupAllowed } from "../../src/lib/auth-errors";

describe("signupAllowed", () => {
  it("only creates users whose email the provider verified", () => {
    expect(signupAllowed({ emailVerified: true })).toBe(true);
    expect(signupAllowed({ emailVerified: false })).toBe(false);
    expect(signupAllowed({ emailVerified: null })).toBe(false);
    expect(signupAllowed({})).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("explains a refused automatic join on sign-in", () => {
    expect(authErrorMessage("account_not_linked", "sign-in")).toMatch(/Sign-in methods/);
    expect(authErrorMessage(EMAIL_NOT_VERIFIED, "sign-in")).toMatch(/isn't verified/);
  });
  it("explains why connecting failed", () => {
    expect(authErrorMessage("account_already_linked_to_different_user", "connect")).toMatch(/different Try Something account/);
    expect(authErrorMessage("unable_to_link_account", "connect")).toMatch(/hasn't verified/);
  });
  it("falls back to a generic line and stays quiet without a code", () => {
    expect(authErrorMessage("something_new", "sign-in")).toBe("Sign-in didn't finish. Please try again.");
    expect(authErrorMessage("something_new", "connect")).toMatch(/couldn't be connected/);
    expect(authErrorMessage(null, "sign-in")).toBeNull();
    expect(authErrorMessage("", "connect")).toBeNull();
  });
});
