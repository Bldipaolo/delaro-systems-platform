"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [method, setMethod] = useState<"link" | "password">("link");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [pending, setPending] = useState(false);

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
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false } });
      setMessageIsError(Boolean(error));
      setMessage(error?.status === 429
        ? "Email sign-in is temporarily limited. Wait before requesting another link, or use your password."
        : error
          ? "We could not send a sign-in link. Please try again later or contact your Delaro account owner."
          : "Check your email. Open the newest link in this same browser and on this computer.");
    }
    setPending(false);
  }

  async function sendRecovery() {
    if (!email.trim()) { setMessage("Enter your work email first."); setMessageIsError(true); return; }
    const supabase = createClient();
    if (!supabase) { setMessage("Authentication is unavailable in this environment."); setMessageIsError(true); return; }
    setPending(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?flow=recovery`,
      });
      setMessageIsError(Boolean(error));
      setMessage(error?.status === 429
        ? "Too many email requests. Wait at least a minute before requesting another reset link."
        : error
          ? "We could not send a reset link right now. Please try again later."
          // Do not reveal whether an email address has an account.
          : "If this address has an account, a password-reset link will arrive shortly. Open the newest link in this same browser.");
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
    <button className="auth-button" type="submit" disabled={pending}>{pending ? (method === "link" ? "Sending…" : "Signing in…") : (method === "link" ? "Send sign-in link" : "Sign in")} <span>→</span></button>
    {message && <p className="auth-message" role={messageIsError ? "alert" : "status"}>{message}</p>}
    <button className="auth-switch" type="button" onClick={() => { setMethod(method === "link" ? "password" : "link"); setMessage(null); setPassword(""); }}>{method === "link" ? "Use a password instead" : "Email me a sign-in link"}</button>
    {method === "password" && <button className="auth-switch" type="button" disabled={pending} onClick={sendRecovery}>Forgot your password?</button>}
  </form>;
}
