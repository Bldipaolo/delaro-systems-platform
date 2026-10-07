"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Authentication is not configured for this environment.");
      setPending(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/overview` } });
    setMessage(error ? error.message : "Check your email for a secure sign-in link.");
    setPending(false);
  }

  return <form className="auth-form" onSubmit={submit}><label htmlFor="email">Work email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required/><button className="auth-button" type="submit" disabled={pending}>{pending ? "Sending…" : "Continue"} <span>→</span></button>{message && <p className="auth-message" role="status">{message}</p>}</form>;
}
