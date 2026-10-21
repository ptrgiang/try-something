// Server-side Turnstile verification. Fails closed when the secret is missing.
export interface TurnstileResult {
  ok: boolean;
  error?: string;
}

/** Cloudflare's published test secrets (always pass / always fail / token already spent). */
export function isTestTurnstileSecret(secret: string | undefined): boolean {
  return /^[123]x0{31}AA$/.test(secret ?? "");
}

/** Test keys are only honored on plain-http (local) sites, so a forgotten test key can't open production to bots. */
export function turnstileConfigured(secret: string | undefined, siteUrl: string): boolean {
  if (!secret) return false;
  return !isTestTurnstileSecret(secret) || !siteUrl.startsWith("https://");
}

export async function verifyTurnstile(
  token: unknown,
  opts: { secret?: string; ip?: string | null; expectedAction: string; expectedHostname?: string; allowTestKeys?: boolean; fetchImpl?: typeof fetch },
): Promise<TurnstileResult> {
  if (!opts.secret || (isTestTurnstileSecret(opts.secret) && !opts.allowTestKeys)) return { ok: false, error: "Bot protection is not configured." };
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, error: "Please complete the bot check." };
  const body = new FormData();
  body.append("secret", opts.secret);
  body.append("response", token);
  if (opts.ip) body.append("remoteip", opts.ip);
  body.append("idempotency_key", crypto.randomUUID());
  let data: { success: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
  try {
    const res = await (opts.fetchImpl ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    data = await res.json();
  } catch {
    return { ok: false, error: "Bot check could not be verified. Try again." };
  }
  if (!data.success) return { ok: false, error: "Bot check failed or expired. Try again." };
  // Cloudflare's test keys report action/hostname as "test"/"example.com"; only enforce real values.
  const isTestResponse = data.hostname === "example.com" && Boolean(opts.allowTestKeys);
  if (!isTestResponse) {
    if (data.action !== opts.expectedAction) return { ok: false, error: "Bot check mismatch." };
    if (opts.expectedHostname && data.hostname !== opts.expectedHostname) return { ok: false, error: "Bot check mismatch." };
  }
  return { ok: true };
}
