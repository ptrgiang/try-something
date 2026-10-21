import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { captcha } from "better-auth/plugins/captcha";
import { turnstileConfigured } from "./turnstile";
import { EMAIL_NOT_VERIFIED, signupAllowed } from "./auth-errors";
import { signInCodeEmail } from "./email";
import { avatarUrl } from "./avatar";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /** The photo to show: upload, then provider photo, else null for initials. */
  image: string | null;
  role: "user" | "moderator" | "admin";
  handle: string | null;
}

export function enabledProviders(env: CloudflareEnv) {
  return {
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    // Email OTP needs Cloudflare Email Service (Workers Paid for arbitrary recipients)
    // and a real Turnstile secret on https, since the captcha is what stops the mailer being abused.
    email:
      env.EMAIL_LOGIN_ENABLED === "true" &&
      Boolean(env.EMAIL && env.EMAIL_FROM) &&
      turnstileConfigured(env.TURNSTILE_SECRET_KEY, env.PUBLIC_SITE_URL),
  };
}

export const databaseHooks = {
  user: {
    create: {
      // An unverified address (possible on GitHub) would let its real owner later sign in by email code
      // into an account someone else can still open. Better Auth's requireEmailVerification creates the row first.
      before: async (user: { emailVerified?: boolean | null }) => {
        if (!signupAllowed(user)) throw new APIError("FORBIDDEN", { code: EMAIL_NOT_VERIFIED, message: "Email not verified by the provider." });
      },
    },
  },
};

let cached: { key: string; auth: ReturnType<typeof createAuth> } | null = null;

export function getAuth(env: CloudflareEnv) {
  const key = env.PUBLIC_SITE_URL;
  if (!cached || cached.key !== key) cached = { key, auth: createAuth(env) };
  return cached.auth;
}

function createAuth(env: CloudflareEnv) {
  const providers = enabledProviders(env);
  const baseURL = env.PUBLIC_SITE_URL;
  const secure = baseURL.startsWith("https://");
  // Sessions are signed with this secret; refuse to run a public site with a missing or weak one.
  if (secure && (env.BETTER_AUTH_SECRET?.length ?? 0) < 32) throw new Error("BETTER_AUTH_SECRET must be set (32+ characters).");
  return betterAuth({
    appName: "Try Something",
    baseURL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [baseURL],
    user: {
      additionalFields: {
        // input:false => never accepted from sign-up/update payloads; set only via admin SQL.
        role: { type: "string", required: false, defaultValue: "user", input: false },
        handle: { type: "string", required: false, input: false },
        avatar: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: {
      // Signing in with a provider whose verified email matches an existing (verified) user joins that user.
      // allowDifferentEmails only applies to connecting from /me/settings/sign-in while signed in, which proves both sides.
      accountLinking: { enabled: true, trustedProviders: [], requireLocalEmailVerified: true, allowDifferentEmails: true },
    },
    databaseHooks,
    socialProviders: {
      ...(providers.github && {
        github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET!, scope: ["read:user", "user:email"] },
      }),
      ...(providers.google && {
        google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" },
      }),
    },
    plugins: providers.email
      ? [
          emailOTP({
            otpLength: 6,
            expiresIn: 600,
            allowedAttempts: 5,
            storeOTP: "hashed",
            async sendVerificationOTP({ email, otp }) {
              await env.EMAIL!.send({ from: { name: "Try Something", email: env.EMAIL_FROM! }, to: email, ...signInCodeEmail(otp) });
            },
          }),
          // Turnstile on the endpoint that sends email, so the mailer can't be abused by bots.
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: env.TURNSTILE_SECRET_KEY ?? "",
            endpoints: ["/email-otp/send-verification-otp"],
          }),
        ]
      : [],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/*": { window: 60, max: 10 },
        "/email-otp/*": { window: 300, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: secure,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure },
    },
  });
}

export async function getSessionUser(env: CloudflareEnv, headers: Headers): Promise<SessionUser | null> {
  const cookie = headers.get("cookie") ?? "";
  if (!cookie.includes("better-auth.session_token")) return null;
  const session = await getAuth(env).api.getSession({ headers });
  if (!session) return null;
  const u = session.user as unknown as SessionUser & { avatar?: string | null };
  return { id: u.id, name: u.name, email: u.email, image: avatarUrl(u.avatar, u.image), role: u.role ?? "user", handle: u.handle ?? null };
}
