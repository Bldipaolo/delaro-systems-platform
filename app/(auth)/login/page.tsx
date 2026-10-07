import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  const demoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  return <main className="auth-page"><div className="auth-panel"><div className="brand-mark auth-brand"><span className="brand-symbol">D</span><span>DELARO</span></div><div className="auth-copy"><p className="eyebrow">Client workspace</p><h1>See what is changing.</h1><p>Sign in to see your projects, results, files, and next steps in one place.</p></div>{demoMode ? <div className="demo-notice"><strong>Demo workspace</strong><span>Explore the client view with sample work and results.</span><Link href="/overview" className="auth-button">Enter workspace <span>→</span></Link></div> : <LoginForm/>}<p className="auth-footnote">Need access? Contact your Delaro account owner.</p></div><div className="auth-aside"><div className="linear-horizon auth-horizon"><span>SEE → IMPROVE → SHARE</span></div><p>Good work is easier to lead when everyone can see what happens next.</p></div></main>;
}
