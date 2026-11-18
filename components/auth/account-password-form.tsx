"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { minimumPasswordLength, passwordMeetsRequirements, passwordRequirements } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/client";

export function AccountPasswordForm({ mode = "setup" }: { mode?: "recovery" | "setup" }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(false);
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }
    if (!passwordMeetsRequirements(password)) {
      setMessage("Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setMessage("Authentication is unavailable in this environment.");
      return;
    }

    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(error.code === "weak_password"
          ? "Supabase rejected this password as weak or previously exposed. Choose a different password."
          : error.status === 401 || error.code === "session_not_found"
            ? "This password-reset session expired. Request a new reset link."
            : "The password could not be saved. Request a new reset link or contact your Delaro account owner.");
        return;
      }

      if (mode === "recovery") await supabase.auth.signOut({ scope: "local" });
      setPassword("");
      setConfirmation("");
      setSuccess(true);
      setMessage(mode === "recovery"
        ? "Password updated. Sign in with your new password."
        : "Password saved. You can use it to sign in next time.");
    } catch {
      setMessage("We could not reach the authentication service. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const requirements = passwordRequirements(password);
  if (success && mode === "recovery") return <div className="auth-success" role="status"><p>{message}</p><Link className="auth-button" href="/login">Return to sign in <span>→</span></Link></div>;

  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="new-password">New password</label>
    <input id="new-password" type="password" autoComplete="new-password" minLength={minimumPasswordLength} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="password-requirements" disabled={pending} required/>
    <ul className="auth-requirements" id="password-requirements" aria-label="Password requirements">
      <li data-met={requirements.length}>At least {minimumPasswordLength} characters</li>
      <li data-met={requirements.lowercase && requirements.uppercase}>Uppercase and lowercase letters</li>
      <li data-met={requirements.number}>At least one number</li>
      <li data-met={requirements.symbol}>At least one symbol</li>
    </ul>
    <label htmlFor="confirm-password">Confirm password</label>
    <input id="confirm-password" type="password" autoComplete="new-password" minLength={minimumPasswordLength} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} required/>
    <button className="auth-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"} <span>→</span></button>
    {message && <p className="auth-message" role={success ? "status" : "alert"} aria-live="polite">{message}</p>}
  </form>;
}
