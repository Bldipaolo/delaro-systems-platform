"use client";

import { FormEvent, useEffect, useState } from "react";
import { authEmailCooldownSeconds, authEmailErrorMessage } from "@/lib/auth/email-errors";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [method, setMethod] = useState<"link" | "password">("password");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setMessageIsError(false);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Authentication is not configured for this environment.");
      setMessageIsError(true);
      setPending(false);
      return;
    }
    if (method === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) {
        setPassword("");
        window.location.assign("/overview");
        return;
      }
      setMessage("Email or password not recognized. Please try again.");
      setMessageIsError(true);
    } else {
      if (cooldown > 0) {
        setMessage(`Wait ${cooldown} seconds before requesting another email.`);
        setMessageIsError(true);
        setPending(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false } });
      setMessageIsError(Boolean(error));
      if (error) {
        const wait = authEmailCooldownSeconds(error);
        if (wait) setCooldown(wait);
        setMessage(authEmailErrorMessage(error, "sign-in"));
      } else {
        setCooldown(60);
        setMessage("Check your email. Open the newest sign-in link; older links may no longer be valid.");
      }
    }
    setPending(false);
  }

  async function sendRecovery() {
    if (!email.trim()) { setMessage("Enter your work email first."); setMessageIsError(true); return; }
    if (cooldown > 0) { setMessage(`Wait ${cooldown} seconds before requesting another email.`); setMessageIsError(true); return; }
    const supabase = createClient();
    if (!supabase) { setMessage("Authentication is unavailable in this environment."); setMessageIsError(true); return; }
    setPending(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?flow=recovery`,
      });
      setMessageIsError(Boolean(error));
      if (error) {
        const wait = authEmailCooldownSeconds(error);
        if (wait) setCooldown(wait);
        setMessage(authEmailErrorMessage(error, "recovery"));
      } else {
        setCooldown(60);
        setMessage(
          // Do not reveal whether an email address has an account.
          "If this address has an account, a password-reset link will arrive shortly. Open only the newest link."
        );
      }
    } catch {
      setMessageIsError(true);
      setMessage("We could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="email">Work email</label>
    <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required/>
    {method === "password" && <><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></>}
    <button className="auth-button" type="submit" disabled={pending || (method === "link" && cooldown > 0)}>{pending ? (method === "link" ? "Sending…" : "Signing in…") : method === "link" && cooldown > 0 ? `Resend in ${cooldown}s` : (method === "link" ? "Send sign-in link" : "Sign in")} <span>→</span></button>
    {message && <p className="auth-message" role={messageIsError ? "alert" : "status"} aria-live="polite">{message}</p>}
    <button className="auth-switch" type="button" onClick={() => { setMethod(method === "link" ? "password" : "link"); setMessage(null); setPassword(""); }}>{method === "link" ? "Use a password instead" : "Email me a sign-in link"}</button>
    {method === "password" && <button className="auth-switch" type="button" disabled={pending || cooldown > 0} onClick={sendRecovery}>{cooldown > 0 ? `Request another email in ${cooldown}s` : "Forgot your password?"}</button>}
  </form>;
}
