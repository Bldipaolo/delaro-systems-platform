import test from "node:test";
import assert from "node:assert/strict";
import { authCallbackDestination, safeAuthRedirectPath } from "../lib/auth/redirects.ts";
import { resolveAuthCallbackAttempt } from "../lib/auth/callback.ts";
import { authEmailCooldownSeconds, authEmailErrorMessage } from "../lib/auth/email-errors.ts";
import { passwordMeetsRequirements, passwordRequirements } from "../lib/auth/password.ts";
import { inviteOrResolveAuthUser, resolveAuthUserByEmail } from "../lib/auth/invitations.ts";

function adminFixture({ profile = null, authUser = null, inviteUser = null, inviteError = null } = {}) {
  return {
    from() {
      return { select() { return { eq() { return { async maybeSingle() { return { data: profile, error: null }; } }; } }; } };
    },
    auth: { admin: {
      async getUserById() { return { data: { user: authUser }, error: authUser ? null : { code: "not_found" } }; },
      async inviteUserByEmail() { return { data: { user: inviteUser }, error: inviteError }; },
    } },
  };
}

test("auth callback honors only allowlisted local destinations", () => {
  assert.equal(safeAuthRedirectPath("/account"), "/account");
  assert.equal(safeAuthRedirectPath("/overview?from=invite"), "/overview?from=invite");
  for (const unsafe of ["https://evil.example", "//evil.example", "/internal/operations", "/account\\evil"]) {
    assert.equal(safeAuthRedirectPath(unsafe), "/overview");
  }
});

test("recovery always reaches password setup while invitation next reaches account setup", () => {
  assert.equal(authCallbackDestination({ flow: "recovery", next: "/overview" }), "/account?recovery=1");
  assert.equal(authCallbackDestination({ next: "/account" }), "/account");
  assert.equal(authCallbackDestination({}), "/overview");
});

test("auth callback accepts PKCE codes and allowlisted token-hash types only", () => {
  assert.deepEqual(resolveAuthCallbackAttempt(new URLSearchParams("code=pkce-code&flow=recovery")), {
    kind: "code", code: "pkce-code", destination: "/account?recovery=1",
  });
  assert.deepEqual(resolveAuthCallbackAttempt(new URLSearchParams("token_hash=secure-hash&type=recovery&next=https://evil.example")), {
    kind: "otp", tokenHash: "secure-hash", type: "recovery", destination: "/account?recovery=1",
  });
  assert.deepEqual(resolveAuthCallbackAttempt(new URLSearchParams("token_hash=invite-hash&type=invite&next=/overview")), {
    kind: "otp", tokenHash: "invite-hash", type: "invite", destination: "/account",
  });
  for (const malformed of ["", "token_hash=x&type=signup", "code=x&token_hash=y&type=recovery", "token_hash=x&type=recovery%00"]) {
    assert.deepEqual(resolveAuthCallbackAttempt(new URLSearchParams(malformed)), { kind: "invalid" });
  }
});

test("password validation requires the documented client minimum", () => {
  assert.equal(passwordMeetsRequirements("short"), false);
  assert.equal(passwordMeetsRequirements("longpasswordonly"), false);
  assert.equal(passwordMeetsRequirements("Delaro-Secure-2026!"), true);
  assert.deepEqual(passwordRequirements("Delaro-Secure-2026!"), {
    length: true, lowercase: true, uppercase: true, number: true, symbol: true,
  });
});

test("email throttling exposes a specific cooldown without weakening server limits", () => {
  const error = { status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 46 seconds." };
  assert.equal(authEmailCooldownSeconds(error), 46);
  assert.match(authEmailErrorMessage(error, "recovery"), /46 seconds/);
  assert.match(authEmailErrorMessage(error, "sign-in"), /password/);
  assert.equal(authEmailCooldownSeconds({ status: 400, code: "bad_request" }), 0);
});

test("existing invitation accounts resolve through the profile index without listing Auth users", async () => {
  const admin = adminFixture({
    profile: { id: "user-1", email: "client@example.com" },
    authUser: { id: "user-1", email: "client@example.com" },
  });
  assert.equal((await resolveAuthUserByEmail(admin, "CLIENT@example.com"))?.id, "user-1");
  const result = await inviteOrResolveAuthUser(admin, {
    email: "client@example.com", redirectTo: "https://app.example/auth/callback?next=/account", organizationName: "Test",
  });
  assert.equal(result.outcome, "existing");
});

test("a new account is invited and a duplicate-invite race resolves predictably", async () => {
  const invited = await inviteOrResolveAuthUser(adminFixture({ inviteUser: { id: "new-user", email: "new@example.com" } }), {
    email: "new@example.com", redirectTo: "https://app.example/auth/callback?next=/account", organizationName: "Test",
  });
  assert.equal(invited.outcome, "invited");

  let lookups = 0;
  const raced = adminFixture({ authUser: { id: "raced-user", email: "race@example.com" }, inviteError: { code: "already_registered" } });
  raced.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: ++lookups === 1 ? null : { id: "raced-user", email: "race@example.com" }, error: null,
  }) }) }) });
  const recovered = await inviteOrResolveAuthUser(raced, {
    email: "race@example.com", redirectTo: "https://app.example/auth/callback?next=/account", organizationName: "Test",
  });
  assert.equal(recovered.outcome, "existing");
  assert.equal(recovered.user.id, "raced-user");
});
