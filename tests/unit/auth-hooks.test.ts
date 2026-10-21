import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { databaseHooks } from "../../src/lib/auth";

// Runs the real Better Auth user-creation path with our hooks, so a config change that stops the
// hook from firing fails here rather than in production.
function makeAuth() {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  return betterAuth({
    baseURL: "http://localhost",
    secret: "test-secret-test-secret-test-secret-123",
    database: memoryAdapter(db),
    databaseHooks,
  });
}

describe("user creation hook", () => {
  it("refuses an account whose email the provider didn't verify", async () => {
    const ctx = await makeAuth().$context;
    await expect(ctx.internalAdapter.createUser({ email: "someone@example.com", name: "X", emailVerified: false }, { method: "email-otp" })).rejects.toMatchObject({
      body: { code: "email_not_verified" },
    });
    expect(await ctx.internalAdapter.findUserByEmail("someone@example.com")).toBeNull();
  });

  it("creates verified accounts as usual", async () => {
    const ctx = await makeAuth().$context;
    const user = await ctx.internalAdapter.createUser({ email: "Real@Example.com", name: "Real", emailVerified: true }, { method: "email-otp" });
    expect(user?.email).toBe("real@example.com");
  });
});
