# Authentication configuration backup — 18 November 2026

This records the non-secret Supabase Auth configuration immediately before the password-recovery repair. It intentionally excludes sender addresses, SMTP usernames/passwords, API keys, tokens, and user credentials.

## URL configuration

- Site URL: `https://delaro-systems-platform.vercel.app`
- Allowed redirects:
  - `http://localhost:3200`
  - `http://localhost:3200/auth/callback`
  - `http://localhost:3200/auth/callback?flow=recovery`
  - `https://delaro-systems-platform.vercel.app/auth/callback`
  - `https://delaro-systems-platform.vercel.app/auth/callback?flow=recovery`

## Email provider

- Email provider: enabled
- New user signups: enabled
- Confirm email: enabled
- Secure email change: enabled
- Secure password change: disabled
- Require current password when updating: disabled
- Leaked-password protection: disabled
- Minimum password length: 6
- Password character requirements: none
- Magic links/email OTP: enabled
- Email OTP expiration: 3,600 seconds
- Email OTP length: 8 digits

## Delivery and throttling

- Custom SMTP: enabled
- Provider host: `smtp.resend.com`
- Port: 465
- Sender name: Delaro Systems
- Per-user minimum email interval: 60 seconds
- Sender email, SMTP username, and SMTP password: intentionally omitted

## Original templates

### Recovery

Subject: `Reset your password`

```html
<h2>Reset your password</h2>

<p>We received a request to reset your password. Follow the link below to choose a new one.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>

<p>If you didn't request this, you can safely ignore this email.</p>
```

### Invitation

Subject: existing subject retained in Supabase; the Dashboard masks it in accessibility output.

```html
<h2>You've been invited</h2>

<p>You've been invited to create an account. Follow the link below to accept.</p>
<p><a href="{{ .ConfirmationURL }}">Accept invitation</a></p>
```

### Magic Link

Subject: `Your sign-in link`

```html
<h2>Your sign-in link</h2>

<p>Follow the link below to sign in. This link expires shortly and can only be used once.</p>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
```

## Applied configuration after backup

The following changes were applied after the original settings above were recorded:

- Recovery, Invitation, and Magic Link email bodies now use explicit `{{ .SiteURL }}/auth/callback` token-hash links with allowlisted OTP types.
- Secure password change: enabled.
- Minimum password length: 12.
- Password character requirements: lowercase, uppercase, digit, and symbol.
- Require current password when updating: unchanged and disabled, so recovery sessions can establish a new password.
- Leaked-password protection: unchanged and disabled because Supabase exposes it only on Pro and above; the current project is on Free.

The original administrator account, credentials, memberships, and role were not modified. Secret SMTP values, API keys, tokens, and user credentials are not recorded here.
