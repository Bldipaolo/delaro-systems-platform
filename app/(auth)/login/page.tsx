import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { isSupabaseConfigured } from "@/lib/auth/context";

const loginErrors: Record<string, string> = {
  invalid_link: "This sign-in link is invalid. Request a new one below.",
  expired_link: "This sign-in link expired or has already been used. Request a new one below.",
  unavailable: "Sign-in is temporarily unavailable. Please try again later.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const demoMode = !isSupabaseConfigured();
  return <main className="auth-page"><div className="auth-panel"><div className="brand-mark auth-brand"><span className="brand-symbol">D</span><span>DELARO</span></div><div className="auth-copy"><p className="eyebrow">Client workspace</p><h1>See what is changing.</h1><p>Sign in to see your operations, improvements, impact, files, and decisions in one place.</p></div>{error && loginErrors[error] && <p className="auth-message" role="alert">{loginErrors[error]}</p>}{demoMode ? <div className="demo-notice"><strong>Demo workspace</strong><span>Explore the client view with illustrative work. Results stay pending until verified.</span><Link href="/overview" className="auth-button">Enter workspace <span>→</span></Link></div> : <LoginForm/>}<p className="auth-footnote">Need access? Contact your Delaro account owner.</p></div><div className="auth-aside"><div className="linear-horizon auth-horizon"><span>SEE → IMPROVE → SHARE</span></div><p>Good work is easier to lead when everyone can see what happens next.</p></div></main>;
}
