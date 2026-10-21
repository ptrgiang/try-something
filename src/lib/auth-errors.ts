// What to tell people when an OAuth sign-in or connect comes back with ?error=<code>.
// Codes come from Better Auth's callback (spaces become underscores) and from our own user hook.

export const EMAIL_NOT_VERIFIED = "email_not_verified";

const SIGN_IN: Record<string, string> = {
  account_not_linked:
    "There's already an account with this email, but that provider didn't confirm you own the address. Sign in the way you did before, then connect this one under Settings → Sign-in methods.",
  [EMAIL_NOT_VERIFIED]:
    "The email on that account isn't verified with the provider. Verify it there (on GitHub, under Settings → Emails), then try again.",
  unable_to_create_user: "We couldn't create your account. Please try again, or use another way to sign in.",
  access_denied: "Sign-in was cancelled.",
};

const CONNECT: Record<string, string> = {
  account_already_linked_to_different_user:
    "That account already signs in to a different Try Something account. To bring them together, sign in with it, delete that account under Settings → Delete account, then connect it here.",
  unable_to_link_account: "That account couldn't be connected because the provider hasn't verified its email.",
  [EMAIL_NOT_VERIFIED]: SIGN_IN[EMAIL_NOT_VERIFIED],
  access_denied: "Connecting was cancelled.",
};

export function authErrorMessage(code: string | null | undefined, context: "sign-in" | "connect"): string | null {
  if (!code) return null;
  const table = context === "connect" ? CONNECT : SIGN_IN;
  return table[code] ?? (context === "connect" ? "That account couldn't be connected. Please try again." : "Sign-in didn't finish. Please try again.");
}

/** One person, one account: refuse to create a user for an address nobody has proved they own. */
export function signupAllowed(user: { emailVerified?: boolean | null }): boolean {
  return user.emailVerified === true;
}
