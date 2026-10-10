"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccountPasswordForm() {
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
    if (password.length < 12) {
      setMessage("Use at least 12 characters.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setMessage("Authentication is unavailable in this environment.");
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      setMessage(error.code === "weak_password"
        ? "Choose a stronger password with a mix of letters, numbers, and symbols."
        : "The password could not be saved. Please sign in again and retry, or contact your Delaro account owner.");
      return;
    }

    setPassword("");
    setConfirmation("");
    setSuccess(true);
    setMessage("Password saved. You can use it to sign in next time.");
  }

  return <form className="auth-form" onSubmit={submit}>
    <label htmlFor="new-password">New password</label>
    <input id="new-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required/>
    <label htmlFor="confirm-password">Confirm password</label>
    <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required/>
    <button className="auth-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"} <span>→</span></button>
    {message && <p className="auth-message" role={success ? "status" : "alert"}>{message}</p>}
  </form>;
}
