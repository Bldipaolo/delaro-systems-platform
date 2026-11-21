# Authentication recovery configuration

Updated 18 November 2026.

Delaro uses Supabase Auth with Next.js SSR. The callback accepts either a PKCE authorization `code` or a hosted email-template `token_hash`; it rejects mixed, malformed, unsupported, expired, and previously used values. Redirect destinations remain restricted by `lib/auth/redirects.ts`.

## Required Supabase settings

In **Authentication → URL Configuration**:

- Site URL: `https://delaro-systems-platform.vercel.app`
- Redirect URLs:
  - `https://delaro-systems-platform.vercel.app/auth/callback`
  - `http://localhost:3200/auth/callback`
  - add the exact active local port only while testing another port

Do not use a broad production wildcard. Preview-deployment wildcards should be added only if preview authentication is intentionally supported.

In **Authentication → Email Templates**, copy the reviewed files from `supabase/templates/` into the matching Recovery, Invite, and Magic Link templates. The production templates build an explicit callback beneath `{{ .SiteURL }}` and pass only `{{ .TokenHash }}` plus an allowlisted OTP type. This avoids implicit-session fragments, which a server callback cannot read, and does not trust a template-supplied redirect destination.

In **Authentication → Sign In / Providers → Email**:

- keep password sign-in enabled;
- set the minimum password length to at least 12;
- require uppercase, lowercase, number, and symbol characters where supported;
- enable leaked-password protection on a supported plan;
- enable secure password changes;
- leave “require current password” disabled so a legitimate recovery session can establish a new password;
- keep email confirmation enabled.

In **Authentication → SMTP Settings**, configure a production SMTP provider and verified sender. Supabase's built-in sender is intended for testing, restricts recipients, and has a low project-wide email limit. Review **Authentication → Rate Limits** after SMTP is configured; do not disable throttling.

## Required Vercel settings

- `NEXT_PUBLIC_SUPABASE_URL`: project URL; browser-safe.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe public key.
- `NEXT_PUBLIC_APP_URL=https://delaro-systems-platform.vercel.app`.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only, required for invitation administration; never prefix with `NEXT_PUBLIC_`.

The browser receives only the public Supabase URL and public key. Passwords are sent directly to Supabase Auth and are not written to Delaro tables, logs, or metadata.

## Live configuration status — 18 November 2026

- Recovery, Invitation, and Magic Link templates use the reviewed token-hash callbacks in `supabase/templates/`.
- Minimum password length is 12 characters.
- Lowercase, uppercase, digit, and symbol requirements are enabled.
- Secure password changes are enabled.
- Require-current-password remains disabled for recovery compatibility.
- Leaked-password protection is not available on the project's current Free plan and remains a release blocker.
- Custom SMTP remains enabled through the existing Resend connection. The 60-second per-user send interval remains enabled and must not be bypassed.
