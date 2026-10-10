import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountPasswordForm } from "@/components/auth/account-password-form";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const { recovery } = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/overview");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return <main className="auth-page"><div className="auth-panel">
    <div className="brand-mark auth-brand"><span className="brand-symbol">D</span><span>DELARO</span></div>
    <div className="auth-copy"><p className="eyebrow">Account security</p><h1>{recovery === "1" ? "Reset your password." : "Set your password."}</h1><p>Choose a unique password with at least 12 characters. Your password is sent directly to Supabase Auth and is never stored by Delaro.</p></div>
    <p className="auth-account-email">Signed in as {user.email}</p>
    <AccountPasswordForm/>
    <p className="auth-footnote"><Link href="/overview">Back to workspace</Link></p>
  </div><div className="auth-aside"><div className="linear-horizon auth-horizon"><span>SEE → IMPROVE → SHARE</span></div><p>Clear access.<br/>Protected work.</p></div></main>;
}
